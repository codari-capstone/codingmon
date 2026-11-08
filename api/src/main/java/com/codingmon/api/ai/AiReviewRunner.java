package com.codingmon.api.ai;

import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

// AI 결과 하나를 만드는 흐름. 오답 분석(F1·F2, AnalysisService)과 코드 리뷰(F3, CodeReviewService)가 같이 쓴다.
// 잡은 시도(Claim)를 처리기에 넣고, 응답을 정답 코드 검사(AnswerGuard, #78)에 거쳐 저장한다. 걸리면 지시를 강화해 한 번 다시 만들고,
// 또 걸리면 차단 표시만 저장해 보여 주지 않는다(AI_FEATURES 8절, database-schema.md).
// 검사를 통과한 응답은 사실 검증(FactCheck, #79)으로 고친 값을 다시 JSON으로 써서, 검증 내역(factCheck)과 함께 저장한다.
// 사실 검증으로는 다시 만들지 않는다. 비공개 값이 요약·힌트에 있으면 차단 표시와 검증 내역만 저장한다.
// 시도를 잡는 일(하루 한도, AiQuotaService)과 결과를 보여 주는 일은 각 서비스가 한다.
@Component
class AiReviewRunner {

    private static final Logger log = LoggerFactory.getLogger(AiReviewRunner.class);
    // 정답 코드 검사 결과를 한 줄씩 남긴다. 품질 평가(#14)에서 위반·재생성·차단 건수를 이 로그로 센다.
    // 응답 글은 남기지 않는다(제출 코드가 섞일 수 있다). 어긴 규칙과 위치, 걸린 태그 이름만 남긴다.
    private static final Logger guardLog = LoggerFactory.getLogger("com.codingmon.api.ai.answer-guard");
    // 사실 검증 결과도 같은 방식으로 한 줄씩 남긴다. 응답 글과 비공개 값은 남기지 않는다.
    private static final Logger factLog = LoggerFactory.getLogger("com.codingmon.api.ai.fact-check");

    // 가드레일에 두 번 걸린 결과. content에 이것만 담긴다.
    static final String BLOCKED_CONTENT = "{\"blocked\": true}";

    // 한 번의 생성. first는 처음 보낼 요청, check는 응답의 정답 코드 검사, retry는 어긴 규칙을 알려 다시 만들 요청,
    // verify는 검사를 통과한 응답의 사실 검증이다.
    record Generation<T>(LlmRequest<T> first, Function<T, List<AnswerGuard.Violation>> check,
            Function<List<AnswerGuard.Violation>, LlmRequest<T>> retry, Function<T, FactCheck.Outcome<T>> verify) {
    }

    private final AiReviewRepository reviews;
    private final AiWorker worker;
    private final Duration pendingTimeout;
    private final JsonMapper json;
    // 이 서버의 처리기에 넣고 아직 끝나지 않은 ai_reviews.id(분석·리뷰 모두). 대기열에서 오래 기다려도 버려진 것으로 보지 않게 한다.
    // 조회는 review_type으로 거르므로 두 기능의 id가 섞여 있어도 된다.
    private final Set<Long> active = ConcurrentHashMap.newKeySet();

    AiReviewRunner(AiReviewRepository reviews, AiWorker worker,
            @Value("${app.llm.pending-timeout}") Duration pendingTimeout, JsonMapper json) {
        this.reviews = reviews;
        this.worker = worker;
        this.pendingTimeout = pendingTimeout;
        this.json = json;
    }

    // 처리기에 넣는다. 시도를 잡은 트랜잭션이 커밋된 뒤에 부른다(PENDING 행이 커밋된 뒤라야 처리기가 결과를 쓴다).
    // generation은 입력과 검사 자료를 읽어 요청을 만든다. 여기서 실패해도 행이 PENDING으로 남지 않게 FAILED로 바꾼다.
    <T> void start(ReviewType type, AiReviewRepository.Claim claim, Supplier<Generation<T>> generation) {
        active.add(claim.id());
        try {
            Generation<T> request = generation.get();
            worker.submit(claim.id(), request.first())
                    .thenCompose(first -> guarded(type, claim, request, first))
                    .whenComplete((content, failure) -> finish(type, claim, content, failure));
        } catch (RuntimeException e) {
            log.error("{} {}을 시작하지 못했다", label(type), claim.id(), e);
            fail(type, claim, AiReviewRepository.FailureReason.INTERNAL);
        }
    }

    AiReviewRepository.Abandoned abandoned() {
        return new AiReviewRepository.Abandoned(pendingTimeout, Set.copyOf(active));
    }

    // 처리기 스레드에서 돈다. 저장할 content를 돌려준다. 다시 만드는 요청도 같은 처리기 대기열에 넣으므로 다른 요청을 앞지르지
    // 않고, 대기열이 차 있으면 BUSY로 실패한다. 다시 만드는 요청의 토큰도 같은 행에 더해진다(AiWorker).
    private <T> CompletableFuture<String> guarded(ReviewType type, AiReviewRepository.Claim claim, Generation<T> request,
            LlmResponse<T> first) {
        List<AnswerGuard.Violation> violations = request.check().apply(first.value());
        if (violations.isEmpty()) {
            logGuard(type, claim, 1, "PASSED", violations);
            return CompletableFuture.completedFuture(verified(type, claim, request, first.value()));
        }
        logGuard(type, claim, 1, "REGENERATE", violations);
        return worker.submit(claim.id(), request.retry().apply(violations)).thenApply(second -> {
            List<AnswerGuard.Violation> again = request.check().apply(second.value());
            logGuard(type, claim, 2, again.isEmpty() ? "PASSED" : "BLOCKED", again);
            return again.isEmpty() ? verified(type, claim, request, second.value()) : BLOCKED_CONTENT;
        });
    }

    // 사실 검증으로 고친 값과 검증 내역(factCheck)을 담은 content. 사실 검증으로 차단하면 결과 대신 차단 표시를 담는다.
    // 모델이 준 JSON 원문(LlmResponse.json)이 아니라 고친 값을 다시 쓴 것이다.
    private <T> String verified(ReviewType type, AiReviewRepository.Claim claim, Generation<T> request, T value) {
        FactCheck.Outcome<T> outcome = request.verify().apply(value);
        factLog.info("fact-check review={} type={} outcome={} removed={} demoted={} unresolved={} fixes={}", claim.id(),
                type, outcome.label(), outcome.meta().removed(), outcome.meta().demoted(), outcome.meta().unresolved(),
                FactCheck.describe(outcome.fixes()));
        ObjectNode content = outcome.blocked() ? json.createObjectNode().put("blocked", true)
                : json.valueToTree(outcome.result());
        content.set("factCheck", json.valueToTree(outcome.meta()));
        return json.writeValueAsString(content);
    }

    // 예: answer-guard review=12 type=CODE_REVIEW attempt=1 outcome=REGENERATE violations=CODE_PATTERN@improvements[1]
    private static void logGuard(ReviewType type, AiReviewRepository.Claim claim, int attempt, String outcome,
            List<AnswerGuard.Violation> violations) {
        guardLog.info("answer-guard review={} type={} attempt={} outcome={} violations={}", claim.id(), type, attempt,
                outcome, AnswerGuard.describe(violations));
    }

    // 처리기 스레드에서 돈다(대기열이 차서 바로 거절되면 요청 스레드). 여기서 던지면 아무도 받지 않으므로 기록만 한다.
    private void finish(ReviewType type, AiReviewRepository.Claim claim, String content, Throwable failure) {
        AiReviewRepository.FailureReason reason = AiReviewRepository.FailureReason.INTERNAL;
        if (failure == null) {
            try {
                if (!reviews.complete(claim, content)) {
                    log.info("{} {}의 이전 시도가 늦게 끝나 결과를 버렸다", label(type), claim.id());
                }
                active.remove(claim.id());
                return;
            } catch (RuntimeException e) {
                // 예: 응답의 \u0000은 JSON으로는 맞지만 jsonb가 받지 않는다. PENDING으로 남기지 않는다.
                log.error("{} {}의 결과를 저장하지 못했다", label(type), claim.id(), e);
            }
        } else {
            Throwable cause = failure instanceof CompletionException && failure.getCause() != null ? failure.getCause() : failure;
            if (cause instanceof LlmException e) {
                reason = reason(e.kind());
                log.warn("{} {} 실패({}): {}", label(type), claim.id(), e.kind(), e.getMessage());
            } else {
                log.error("{} {} 실패", label(type), claim.id(), cause);
            }
        }
        fail(type, claim, reason);
    }

    // 빠짐없는 switch라 Kind에 값이 늘면 컴파일이 깨진다. 이름으로 바꾸면(valueOf) 빠진 값이 콜백 안에서 예외가 되어
    // fail()에 닿지 못하고, 그 행은 재시작할 때까지 PENDING으로 남는다.
    private static AiReviewRepository.FailureReason reason(LlmException.Kind kind) {
        return switch (kind) {
            case UNAVAILABLE -> AiReviewRepository.FailureReason.UNAVAILABLE;
            case RATE_LIMITED -> AiReviewRepository.FailureReason.RATE_LIMITED;
            case BUSY -> AiReviewRepository.FailureReason.BUSY;
            case INVALID_RESPONSE -> AiReviewRepository.FailureReason.INVALID_RESPONSE;
        };
    }

    // active에서 먼저 뺀다. FAILED를 커밋한 뒤에 빼면 그 사이 같은 행을 다시 잡은 새 시도의 등록까지 지운다.
    // 빼고 커밋하기 전에 다른 요청이 행을 다시 잡으면 이 시도의 fail은 attempt가 달라 아무것도 바꾸지 않는다.
    // DB가 내려가 FAILED로도 못 바꾸면 행은 PENDING으로 남고, 처리기에서 빠졌으므로 pending-timeout 뒤에 버려진 것으로 보인다.
    private void fail(ReviewType type, AiReviewRepository.Claim claim, AiReviewRepository.FailureReason reason) {
        active.remove(claim.id());
        try {
            reviews.fail(claim, reason);
        } catch (RuntimeException e) {
            log.error("{} {}을 실패로 기록하지 못했다", label(type), claim.id(), e);
        }
    }

    private static String label(ReviewType type) {
        return type == ReviewType.ANALYSIS ? "AI 분석" : "AI 코드 리뷰";
    }
}
