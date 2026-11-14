package com.codingmon.api.ai;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.ErrorResponseException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.ai.AiReviewRepository.Abandoned;
import com.codingmon.api.ai.AiReviewRepository.Claim;
import com.codingmon.api.ai.AiReviewRepository.FailureReason;
import com.codingmon.api.ai.AiReviewRepository.Status;
import com.codingmon.api.learning.LearningStatsRepository;
import com.codingmon.api.learning.LearningStatsRepository.LearningStats;
import com.codingmon.api.learning.RecommendationRepository;
import com.codingmon.api.learning.RecommendationRepository.Recommendation;

import tools.jackson.databind.json.JsonMapper;

// 학습 리포트(F4, AI_FEATURES 7절, #85). 사용자당 하루(UTC 날짜) 1회 새로 만들고, 그 사이에는 저장한 리포트를 돌려준다.
// 만들 때 통계(LearningStatsRepository)와 추천(RecommendationRepository)을 계산해 저장하고, AI는 그 옆에 붙는 문장만 쓴다.
// 화면의 수치·추천 목록은 저장한 서버 값을 쓰고 AI 응답에서 가져오지 않는다.
// AI 응답은 입력 순서에 맞추고(LearningReportResult.alignedTo) 문장 속 수치를 통계와 대조해(ReportNumberCheck) 저장한다.
// 맞출 수 없는 응답(같은 개념·순위를 되풀이)과 모델 호출 실패는 FAILED로 두고, 다음 요청에서 같은 행으로 다시 만든다.
// 처리 흐름은 분석·리뷰(AiReviewRunner)와 같다. 같은 처리기(AiWorker)를 쓰고, 모델을 기다리는 동안 DB 연결을 쥐지 않는다.
// 리포트에는 코드를 쓸 자리가 없어 정답 코드 검사(AnswerGuard)와 다시 만들기는 없다. 분석·리뷰의 하루 한도(AiQuotaService)에도 세지 않는다.
@Service
class LearningReportService {

    private static final Logger log = LoggerFactory.getLogger(LearningReportService.class);
    // 수치 대조 결과를 한 줄씩 남긴다. 품질 평가에서 지운 문장 수를 이 로그로 센다. 응답 글은 남기지 않는다.
    private static final Logger numberLog = LoggerFactory.getLogger("com.codingmon.api.ai.report-number-check");

    // 요청 결과. started면 이 요청이 새 시도를 시작했다.
    record Requested(LearningReportView view, boolean started) {
    }

    private final LearningReportRepository reports;
    private final LearningStatsRepository stats;
    private final RecommendationRepository recommendations;
    private final NextConceptRepository nextConcepts;
    private final LearningReportPrompt prompt;
    private final AiWorker worker;
    private final LlmClient llm;
    private final JsonMapper json;
    private final TransactionTemplate transactions;
    // 리포트 행(통계)과 추천을 한 시점에서 읽는다. 재시도가 둘을 한 트랜잭션에서 함께 바꾸므로 따로 읽으면 옛 통계와 새 추천이 섞인다.
    private final TransactionTemplate snapshot;
    private final Duration pendingTimeout;
    // 이 서버의 처리기에 넣고 아직 끝나지 않은 learning_reports.id. 대기열에서 오래 기다려도 버려진 것으로 보지 않게 한다.
    // ai_reviews.id와 번호가 겹치므로 AiReviewRunner의 목록과 따로 둔다.
    private final Set<Long> active = ConcurrentHashMap.newKeySet();

    // 시도를 잡는 트랜잭션은 늘 새로 열고 READ COMMITTED로 둔다(AiQuotaService와 같은 이유). 같은 날 행이 생겼는지는 claim 한 문장이
    // 가리므로 사용자 행을 잠그지 않는다.
    LearningReportService(LearningReportRepository reports, LearningStatsRepository stats,
            RecommendationRepository recommendations, NextConceptRepository nextConcepts, LearningReportPrompt prompt,
            AiWorker worker, LlmClient llm, JsonMapper json, PlatformTransactionManager transactionManager,
            @Value("${app.llm.pending-timeout}") Duration pendingTimeout) {
        this.reports = reports;
        this.stats = stats;
        this.recommendations = recommendations;
        this.nextConcepts = nextConcepts;
        this.prompt = prompt;
        this.worker = worker;
        this.llm = llm;
        this.json = json;
        this.transactions = new TransactionTemplate(transactionManager);
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.snapshot = new TransactionTemplate(transactionManager);
        this.snapshot.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        this.snapshot.setReadOnly(true);
        this.pendingTimeout = pendingTimeout;
    }

    // 오늘 리포트가 끝났거나 만드는 중이면 그것을 돌려준다. 없거나 FAILED(버려진 PENDING 포함)면 통계·추천·입력을 지금 기준으로 만들고
    // 시도를 잡는다. 통계는 그 저장소가 REPEATABLE READ로 한 시점을 읽으므로 시도를 잡는 트랜잭션 밖에서 먼저 읽는다.
    // 그사이 다른 요청이 먼저 잡았으면 계산한 것을 버리고 그 리포트를 돌려준다. 처리기에는 잡은 트랜잭션이 커밋된 뒤에 넣는다.
    Requested request(long userId) {
        Optional<LearningReportView> today = snapshot.execute(status -> reports.findToday(userId, abandoned())
                .filter(stored -> stored.status() != Status.FAILED)
                .map(stored -> view(userId, stored)));
        if (today.isPresent()) {
            return new Requested(today.get(), false);
        }
        LearningStats current = stats.find(userId);
        if (current.remainingProblemCount() > 0) {
            throw notAvailable(current.remainingProblemCount());
        }
        List<Recommendation> picked = recommendations.recommend(userId, current);
        LearningReportInput input = input(userId, current, picked);
        String statistics = json.writeValueAsString(current);
        Optional<Claim> claim = transactions.execute(status -> reports.claim(userId, statistics, version(), llm.model(),
                abandoned()).map(claimed -> {
                    reports.replaceRecommendations(claimed.id(), picked);
                    return claimed;
                }));
        claim.ifPresent(claimed -> start(claimed, input));
        // 잡은 뒤 날짜가 바뀌어도 방금 잡은 행이 가장 최근 행이다.
        LearningReportView latest = latest(userId)
                .orElseThrow(() -> new IllegalStateException("만든 학습 리포트 행이 없다: 사용자 " + userId));
        return new Requested(latest, claim.isPresent());
    }

    // 화면을 열 때와 폴링. 가장 최근 날짜의 리포트다.
    LearningReportView find(long userId) {
        return latest(userId).orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "LEARNING_REPORT_NOT_FOUND",
                "학습 리포트를 찾을 수 없어요"));
    }

    private Optional<LearningReportView> latest(long userId) {
        return snapshot.execute(status -> reports.findLatest(userId, abandoned()).map(stored -> view(userId, stored)));
    }

    // 맞힌 문제가 모자라면 아무것도 만들지 않는다(REP-01). 더 맞혀야 할 개수를 본문에 함께 준다.
    private static ErrorResponseException notAvailable(int remaining) {
        ErrorResponseException error = ApiErrors.error(HttpStatus.CONFLICT, "LEARNING_REPORT_NOT_AVAILABLE",
                "%d문제 더 맞히면 리포트를 볼 수 있어요".formatted(remaining));
        error.getBody().setProperty("remainingProblemCount", remaining);
        return error;
    }

    // 모델에 보낼 입력. 저장하는 통계·추천과 같은 값으로 만든다.
    private LearningReportInput input(long userId, LearningStats current, List<Recommendation> picked) {
        List<LearningReportInput.Recommendation> recommended = reports.findRecommended(userId, picked).stream()
                .map(p -> LearningReportInput.Recommendation.of(p.rank(), p.title(), p.difficulty(), p.concept(),
                        p.attempted()))
                .toList();
        return LearningReportInput.of(current, recommended,
                nextConcepts.findRecent(userId, LearningReportInput.NEXT_CONCEPT_REVIEWS));
    }

    // 처리기에 넣는다. 요청을 만들다 실패해도 행이 PENDING으로 남지 않게 FAILED로 바꾼다.
    private void start(Claim claim, LearningReportInput input) {
        active.add(claim.id());
        try {
            worker.submit("학습 리포트 " + claim.id(), usage -> reports.addUsage(claim.id(), usage), prompt.request(input))
                    .thenApply(response -> content(claim, input, response.value()))
                    .whenComplete((content, failure) -> finish(claim, content, failure));
        } catch (RuntimeException e) {
            log.error("학습 리포트 {}를 시작하지 못했다", claim.id(), e);
            fail(claim, FailureReason.INTERNAL);
        }
    }

    // 처리기 스레드에서 돈다. 저장할 content JSON이다. 순서를 맞출 수 없으면 형식에 맞지 않는 응답으로 보고 실패시킨다.
    private String content(Claim claim, LearningReportInput input, LearningReportResult result) {
        LearningReportResult aligned = result.alignedTo(input)
                .orElseThrow(() -> new LlmException(LlmException.Kind.INVALID_RESPONSE,
                        "취약 개념·추천을 입력과 맞출 수 없다(같은 개념이나 순위를 되풀이했다)", null, LlmUsage.NONE));
        ReportNumberCheck.Outcome checked = ReportNumberCheck.verify(aligned, input);
        ReportNumberCheck.Meta meta = checked.content().numberCheck();
        // 예: report-number-check report=3 outcome=FIXED removed=1 emptied=0 fixes=PERCENT@weakConcepts[0].explanation
        numberLog.info("report-number-check report={} outcome={} removed={} emptied={} fixes={}", claim.id(),
                checked.label(), meta.removed(), meta.emptied(), ReportNumberCheck.describe(checked.fixes()));
        return json.writeValueAsString(checked.content());
    }

    // 처리기 스레드에서 돈다(대기열이 차서 바로 거절되면 요청 스레드). 여기서 던지면 아무도 받지 않으므로 기록만 한다.
    private void finish(Claim claim, String content, Throwable failure) {
        FailureReason reason = FailureReason.INTERNAL;
        if (failure == null) {
            try {
                if (!reports.complete(claim, content)) {
                    log.info("학습 리포트 {}의 이전 시도가 늦게 끝나 결과를 버렸다", claim.id());
                }
                active.remove(claim.id());
                return;
            } catch (RuntimeException e) {
                log.error("학습 리포트 {}의 결과를 저장하지 못했다", claim.id(), e);
            }
        } else {
            Throwable cause = failure instanceof CompletionException && failure.getCause() != null ? failure.getCause()
                    : failure;
            if (cause instanceof LlmException e) {
                reason = FailureReason.of(e.kind());
                log.warn("학습 리포트 {} 실패({}): {}", claim.id(), e.kind(), e.getMessage());
            } else {
                log.error("학습 리포트 {} 실패", claim.id(), cause);
            }
        }
        fail(claim, reason);
    }

    // active에서 먼저 뺀다(AiReviewRunner.fail과 같은 이유). FAILED로도 못 바꾸면 pending-timeout 뒤에 버려진 것으로 보인다.
    private void fail(Claim claim, FailureReason reason) {
        active.remove(claim.id());
        try {
            reports.fail(claim, reason);
        } catch (RuntimeException e) {
            log.error("학습 리포트 {}를 실패로 기록하지 못했다", claim.id(), e);
        }
    }

    // snapshot 안에서 부른다.
    private LearningReportView view(long userId, LearningReportRepository.Stored stored) {
        LearningStats statistics = json.readValue(stored.statistics(), LearningStats.class);
        LearningReportContent content = stored.status() == Status.COMPLETED
                ? json.readValue(stored.content(), LearningReportContent.class) : null;
        return LearningReportView.of(stored, statistics, content, reports.findRecommendations(userId, stored.id()));
    }

    private Abandoned abandoned() {
        return new Abandoned(pendingTimeout, Set.copyOf(active));
    }

    private String version() {
        return llm.promptVersion(ReviewType.LEARNING_REPORT);
    }
}
