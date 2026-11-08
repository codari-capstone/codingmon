package com.codingmon.api.ai;

import java.time.Duration;
import java.util.Set;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.submission.UserProblemStatsRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// AI 오답 분석(F1)과 힌트 공개(F2). 분석은 요청할 때 한 번 만들어 ai_reviews에 저장하고, 힌트는 저장된 것을 연 단계까지만 준다
// (AI_FEATURES 3·4절). 같은 제출·같은 프롬프트 버전의 결과는 다시 만들지 않는다(8절).
// 하루 한도는 AiQuotaService가 센다(#80). 정답 코드 검사(#78), 사실 검증(#79), 실패 사유 구분(#81)은 아직 없다.
@Service
class AnalysisService {

    private static final Logger log = LoggerFactory.getLogger(AnalysisService.class);

    // 요청 결과. started면 이 요청이 새 시도를 시작했다.
    record Requested(AnalysisView view, boolean started) {
    }

    private final AiReviewRepository reviews;
    private final AnalysisInputRepository inputs;
    private final AnalysisPrompt prompt;
    private final AiWorker worker;
    private final LlmClient llm;
    private final UserProblemStatsRepository stats;
    private final JsonMapper json;
    private final Duration pendingTimeout;
    private final AiQuotaService quota;
    // 이 서버의 처리기에 넣고 아직 끝나지 않은 ai_reviews.id. 대기열에서 오래 기다려도 버려진 것으로 보지 않게 한다.
    private final Set<Long> active = ConcurrentHashMap.newKeySet();

    AnalysisService(AiReviewRepository reviews, AnalysisInputRepository inputs, AnalysisPrompt prompt, AiWorker worker,
            LlmClient llm, UserProblemStatsRepository stats, JsonMapper json,
            @Value("${app.llm.pending-timeout}") Duration pendingTimeout, AiQuotaService quota) {
        this.reviews = reviews;
        this.inputs = inputs;
        this.prompt = prompt;
        this.worker = worker;
        this.llm = llm;
        this.stats = stats;
        this.json = json;
        this.pendingTimeout = pendingTimeout;
        this.quota = quota;
    }

    // 시도를 잡는 일만 하루 한도 검사와 한 트랜잭션에서 하고(AiQuotaService.claimWithin), 나머지는 문장마다 커밋한다.
    // 처리기에는 그 트랜잭션이 커밋된 뒤에 넣는다. PENDING 행이 커밋된 뒤라야 처리기가 결과를 쓴다.
    Requested request(long userId, long submissionId) {
        AiReviewRepository.Target target = reviews.findTarget(userId, submissionId)
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "SUBMISSION_NOT_FOUND", "제출을 찾을 수 없어요"));
        if (!"COMPLETED".equals(target.jobStatus()) || "ACCEPTED".equals(target.verdict())) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "ANALYSIS_NOT_AVAILABLE", "오답 판정을 받은 제출만 분석할 수 있어요");
        }
        String version = version();
        boolean started = quota.claimWithin(userId, submissionId,
                () -> reviews.claim(submissionId, ReviewType.ANALYSIS, version, llm.model(), abandoned()))
                .map(claim -> start(submissionId, claim))
                .isPresent();
        AiReviewRepository.Stored stored = reviews.findShown(userId, submissionId, ReviewType.ANALYSIS, version,
                abandoned())
                .orElseThrow(() -> new IllegalStateException("만든 AI 분석 행이 없다: 제출 " + submissionId));
        return new Requested(view(userId, stored), started);
    }

    // 결과 화면의 폴링과 제출 기록(HIST-02)이 부른다.
    AnalysisView find(long userId, long submissionId) {
        return reviews.findShown(userId, submissionId, ReviewType.ANALYSIS, version(), abandoned())
                .map(stored -> view(userId, stored))
                .orElseThrow(AnalysisService::notFound);
    }

    // 조회가 보여 주는 결과의 힌트를 연다. 다음 단계만 열고, 이미 연 단계면 그대로 돌려줘 두 번 눌러도 한 단계만 열린다.
    @Transactional
    AnalysisView revealHint(long userId, long submissionId, int level) {
        AiReviewRepository.Stored shown = reviews.findShown(userId, submissionId, ReviewType.ANALYSIS, version(),
                abandoned())
                .orElseThrow(AnalysisService::notFound);
        AiReviewRepository.Stored stored = reviews.lock(shown.id(), abandoned());
        if (stored.status() != AiReviewRepository.Status.COMPLETED) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "ANALYSIS_NOT_READY", "분석이 끝난 뒤에 힌트를 볼 수 있어요");
        }
        if (blocked(stored)) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "ANALYSIS_BLOCKED", "이 분석은 보여 줄 수 없어요");
        }
        if (level > stored.revealedHintLevel() + 1) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "HINT_LEVEL_SKIPPED", "앞 단계 힌트를 먼저 열어 주세요");
        }
        if (level <= stored.revealedHintLevel()) {
            return view(userId, stored);
        }
        reviews.revealHint(stored.id(), level);
        stats.recordHintRevealed(submissionId, level);
        return view(userId, new AiReviewRepository.Stored(stored.id(), stored.submissionId(), stored.status(),
                stored.content(), level, stored.createdAt(), stored.completedAt()));
    }

    // 처리기에 넣는다. 넣기 전에 실패해도 행이 PENDING으로 남지 않게 FAILED로 바꾼다.
    private AiReviewRepository.Claim start(long submissionId, AiReviewRepository.Claim claim) {
        active.add(claim.id());
        try {
            AnalysisInput input = inputs.find(submissionId)
                    .orElseThrow(() -> new IllegalStateException("분석 입력을 만들 수 없다: 제출 " + submissionId));
            worker.submit(claim.id(), prompt.request(input)).whenComplete((response, failure) -> finish(claim, response, failure));
        } catch (RuntimeException e) {
            log.error("AI 분석 {}을 시작하지 못했다", claim.id(), e);
            fail(claim);
        }
        return claim;
    }

    // 처리기 스레드에서 돈다(대기열이 차서 바로 거절되면 요청 스레드). 여기서 던지면 아무도 받지 않으므로 기록만 한다.
    private void finish(AiReviewRepository.Claim claim, LlmResponse<AnalysisResult> response, Throwable failure) {
        if (failure == null) {
            try {
                if (!reviews.complete(claim, response.json())) {
                    log.info("AI 분석 {}의 이전 시도가 늦게 끝나 결과를 버렸다", claim.id());
                }
                active.remove(claim.id());
                return;
            } catch (RuntimeException e) {
                // 예: 응답의 \u0000은 JSON으로는 맞지만 jsonb가 받지 않는다. PENDING으로 남기지 않는다.
                log.error("AI 분석 {}의 결과를 저장하지 못했다", claim.id(), e);
            }
        } else {
            Throwable cause = failure instanceof CompletionException && failure.getCause() != null ? failure.getCause() : failure;
            if (cause instanceof LlmException e) {
                log.warn("AI 분석 {} 실패({}): {}", claim.id(), e.kind(), e.getMessage());
            } else {
                log.error("AI 분석 {} 실패", claim.id(), cause);
            }
        }
        fail(claim);
    }

    // active에서 먼저 뺀다. FAILED를 커밋한 뒤에 빼면 그 사이 같은 행을 다시 잡은 새 시도의 등록까지 지운다.
    // 빼고 커밋하기 전에 다른 요청이 행을 다시 잡으면 이 시도의 fail은 attempt가 달라 아무것도 바꾸지 않는다.
    // DB가 내려가 FAILED로도 못 바꾸면 행은 PENDING으로 남고, 처리기에서 빠졌으므로 pending-timeout 뒤에 버려진 것으로 보인다.
    private void fail(AiReviewRepository.Claim claim) {
        active.remove(claim.id());
        try {
            reviews.fail(claim);
        } catch (RuntimeException e) {
            log.error("AI 분석 {}을 실패로 기록하지 못했다", claim.id(), e);
        }
    }

    // 남은 횟수는 결과를 만든 날이 아니라 응답하는 지금 기준이다(contracts의 SubmissionAnalysis.quota).
    private AnalysisView view(long userId, AiReviewRepository.Stored stored) {
        AiQuota today = quota.status(userId);
        if (stored.status() != AiReviewRepository.Status.COMPLETED) {
            return AnalysisView.of(stored, false, null, today);
        }
        JsonNode content = json.readTree(stored.content());
        if (content.path("blocked").asBoolean(false)) {
            return AnalysisView.of(stored, true, null, today);
        }
        return AnalysisView.of(stored, false, json.treeToValue(content, AnalysisResult.class), today);
    }

    // 가드레일에 두 번 걸려 보여 주지 않기로 한 결과(#78, database-schema.md). content에 "blocked": true만 담긴다.
    private boolean blocked(AiReviewRepository.Stored stored) {
        return json.readTree(stored.content()).path("blocked").asBoolean(false);
    }

    private AiReviewRepository.Abandoned abandoned() {
        return new AiReviewRepository.Abandoned(pendingTimeout, Set.copyOf(active));
    }

    private String version() {
        return llm.promptVersion(ReviewType.ANALYSIS);
    }

    private static RuntimeException notFound() {
        return ApiErrors.error(HttpStatus.NOT_FOUND, "ANALYSIS_NOT_FOUND", "AI 분석을 찾을 수 없어요");
    }
}
