package com.codingmon.api.ai;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.CompletionException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.submission.UserProblemStatsRepository;

import tools.jackson.databind.json.JsonMapper;

// AI 오답 분석(F1)과 힌트 공개(F2). 분석은 요청할 때 한 번 만들어 ai_reviews에 저장하고, 힌트는 저장된 것을 연 단계까지만 준다
// (AI_FEATURES 3·4절). 같은 제출·같은 프롬프트 버전의 결과는 다시 만들지 않는다(8절).
// 하루 한도(#80), 정답 코드 검사(#78), 사실 검증(#79), 실패 사유 구분(#81)은 아직 없다.
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

    AnalysisService(AiReviewRepository reviews, AnalysisInputRepository inputs, AnalysisPrompt prompt, AiWorker worker,
            LlmClient llm, UserProblemStatsRepository stats, JsonMapper json,
            @Value("${app.llm.pending-timeout}") Duration pendingTimeout) {
        this.reviews = reviews;
        this.inputs = inputs;
        this.prompt = prompt;
        this.worker = worker;
        this.llm = llm;
        this.stats = stats;
        this.json = json;
        this.pendingTimeout = pendingTimeout;
    }

    // 트랜잭션 없이 문장마다 커밋한다. PENDING 행이 커밋된 뒤에 처리기가 결과를 쓴다.
    Requested request(long userId, long submissionId) {
        AiReviewRepository.Target target = reviews.findTarget(userId, submissionId)
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "SUBMISSION_NOT_FOUND", "제출을 찾을 수 없어요"));
        if (!"COMPLETED".equals(target.jobStatus()) || "ACCEPTED".equals(target.verdict())) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "ANALYSIS_NOT_AVAILABLE", "오답 판정을 받은 제출만 분석할 수 있어요");
        }
        String version = llm.promptVersion(ReviewType.ANALYSIS);
        Instant staleBefore = staleBefore();
        Optional<AiReviewRepository.Claim> claim = reviews.claim(submissionId, ReviewType.ANALYSIS, version, llm.model(),
                staleBefore);
        claim.ifPresent(c -> start(submissionId, c));
        AiReviewRepository.Stored stored = reviews.find(submissionId, ReviewType.ANALYSIS, version, staleBefore)
                .orElseThrow(() -> new IllegalStateException("만든 AI 분석 행이 없다: 제출 " + submissionId));
        return new Requested(view(stored), claim.isPresent());
    }

    // 결과 화면의 폴링과 제출 기록(HIST-02)이 부른다.
    AnalysisView find(long userId, long submissionId) {
        return reviews.findLatest(userId, submissionId, ReviewType.ANALYSIS, staleBefore(), false)
                .map(this::view)
                .orElseThrow(AnalysisService::notFound);
    }

    // 다음 단계만 연다. 이미 연 단계면 그대로 돌려줘 두 번 눌러도 한 단계만 열린다.
    @Transactional
    AnalysisView revealHint(long userId, long submissionId, int level) {
        AiReviewRepository.Stored stored = reviews.findLatest(userId, submissionId, ReviewType.ANALYSIS, staleBefore(), true)
                .orElseThrow(AnalysisService::notFound);
        if (stored.status() != AiReviewRepository.Status.COMPLETED) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "ANALYSIS_NOT_READY", "분석이 끝난 뒤에 힌트를 볼 수 있어요");
        }
        if (level > stored.revealedHintLevel() + 1) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "HINT_LEVEL_SKIPPED", "앞 단계 힌트를 먼저 열어 주세요");
        }
        if (level <= stored.revealedHintLevel()) {
            return view(stored);
        }
        reviews.revealHint(stored.id(), level);
        stats.recordHintRevealed(submissionId, level);
        return view(new AiReviewRepository.Stored(stored.id(), stored.submissionId(), stored.status(), stored.content(),
                level, stored.createdAt(), stored.completedAt()));
    }

    // 처리기에 넣는다. 넣기 전에 실패해도 행이 PENDING으로 남지 않게 FAILED로 바꾼다.
    private void start(long submissionId, AiReviewRepository.Claim claim) {
        try {
            AnalysisInput input = inputs.find(submissionId)
                    .orElseThrow(() -> new IllegalStateException("분석 입력을 만들 수 없다: 제출 " + submissionId));
            worker.submit(claim.id(), prompt.request(input)).whenComplete((response, failure) -> finish(claim, response, failure));
        } catch (RuntimeException e) {
            log.error("AI 분석 {}을 시작하지 못했다", claim.id(), e);
            reviews.fail(claim);
        }
    }

    // 처리기 스레드에서 돈다(대기열이 차서 바로 거절되면 요청 스레드). 여기서 던지면 아무도 받지 않으므로 기록만 한다.
    private void finish(AiReviewRepository.Claim claim, LlmResponse<AnalysisResult> response, Throwable failure) {
        try {
            if (failure == null) {
                if (!reviews.complete(claim, response.json())) {
                    log.info("AI 분석 {}의 이전 시도가 늦게 끝나 결과를 버렸다", claim.id());
                }
                return;
            }
            Throwable cause = failure instanceof CompletionException && failure.getCause() != null ? failure.getCause() : failure;
            if (cause instanceof LlmException e) {
                log.warn("AI 분석 {} 실패({}): {}", claim.id(), e.kind(), e.getMessage());
            } else {
                log.error("AI 분석 {} 실패", claim.id(), cause);
            }
            reviews.fail(claim);
        } catch (RuntimeException e) {
            log.error("AI 분석 {}의 결과를 저장하지 못했다", claim.id(), e);
        }
    }

    private AnalysisView view(AiReviewRepository.Stored stored) {
        AnalysisResult result = stored.status() == AiReviewRepository.Status.COMPLETED
                ? json.readValue(stored.content(), AnalysisResult.class)
                : null;
        return AnalysisView.of(stored, result);
    }

    // 이보다 먼저 시작해 끝나지 않은 PENDING은 실패로 본다(서버가 그 사이 내려갔거나 결과를 잃었다).
    private Instant staleBefore() {
        return Instant.now().minus(pendingTimeout);
    }

    private static RuntimeException notFound() {
        return ApiErrors.error(HttpStatus.NOT_FOUND, "ANALYSIS_NOT_FOUND", "AI 분석을 찾을 수 없어요");
    }
}
