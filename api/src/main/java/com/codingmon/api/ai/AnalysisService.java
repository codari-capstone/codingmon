package com.codingmon.api.ai;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.submission.UserProblemStatsRepository;

import tools.jackson.databind.json.JsonMapper;

// AI 오답 분석(F1)과 힌트 공개(F2). 분석은 요청할 때 한 번 만들어 ai_reviews에 저장하고, 힌트는 저장된 것을 연 단계까지만 준다
// (AI_FEATURES 3·4절). 같은 제출·같은 프롬프트 버전의 결과는 다시 만들지 않는다(8절).
// 만드는 흐름(처리기, 정답 코드 검사와 1회 재생성, 차단 저장)은 AiReviewRunner가 맡는다(#78). 하루 한도는 AiQuotaService가 센다(#80).
// 만들지 못한 이유는 ai_reviews.failure_reason으로 응답에 준다(#81). 사실 검증(#79)은 아직 없다.
@Service
class AnalysisService {

    // 요청 결과. started면 이 요청이 새 시도를 시작했다.
    record Requested(AnalysisView view, boolean started) {
    }

    private final AiReviewRepository reviews;
    private final AnalysisInputRepository inputs;
    private final AnswerGuardRepository guards;
    private final AnalysisPrompt prompt;
    private final AiReviewRunner runner;
    private final LlmClient llm;
    private final UserProblemStatsRepository stats;
    private final JsonMapper json;
    private final AiQuotaService quota;

    AnalysisService(AiReviewRepository reviews, AnalysisInputRepository inputs, AnswerGuardRepository guards,
            AnalysisPrompt prompt, AiReviewRunner runner, LlmClient llm, UserProblemStatsRepository stats, JsonMapper json,
            AiQuotaService quota) {
        this.reviews = reviews;
        this.inputs = inputs;
        this.guards = guards;
        this.prompt = prompt;
        this.runner = runner;
        this.llm = llm;
        this.stats = stats;
        this.json = json;
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
                () -> reviews.claim(submissionId, ReviewType.ANALYSIS, version, llm.model(), runner.abandoned()))
                .map(claim -> {
                    runner.start(ReviewType.ANALYSIS, claim, () -> generation(submissionId));
                    return claim;
                })
                .isPresent();
        AiReviewRepository.Stored stored = reviews.findShown(userId, submissionId, ReviewType.ANALYSIS, version,
                runner.abandoned())
                .orElseThrow(() -> new IllegalStateException("만든 AI 분석 행이 없다: 제출 " + submissionId));
        return new Requested(view(userId, stored), started);
    }

    // 결과 화면의 폴링과 제출 기록(HIST-02)이 부른다.
    AnalysisView find(long userId, long submissionId) {
        return reviews.findShown(userId, submissionId, ReviewType.ANALYSIS, version(), runner.abandoned())
                .map(stored -> view(userId, stored))
                .orElseThrow(AnalysisService::notFound);
    }

    // 조회가 보여 주는 결과의 힌트를 연다. 다음 단계만 열고, 이미 연 단계면 그대로 돌려줘 두 번 눌러도 한 단계만 열린다.
    @Transactional
    AnalysisView revealHint(long userId, long submissionId, int level) {
        AiReviewRepository.Stored shown = reviews.findShown(userId, submissionId, ReviewType.ANALYSIS, version(),
                runner.abandoned())
                .orElseThrow(AnalysisService::notFound);
        AiReviewRepository.Stored stored = reviews.lock(shown.id(), runner.abandoned());
        if (stored.status() != AiReviewRepository.Status.COMPLETED) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "ANALYSIS_NOT_READY", "분석이 끝난 뒤에 힌트를 볼 수 있어요");
        }
        if (stored.blocked()) {
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
                stored.failureReason(), stored.content(), stored.blocked(), level, stored.createdAt(), stored.completedAt()));
    }

    // 처리기에 넣을 요청. 입력과 정답 코드 검사 자료를 읽는다. 읽지 못하면 던지고, runner가 행을 FAILED로 바꾼다.
    private AiReviewRunner.Generation<AnalysisResult> generation(long submissionId) {
        AnalysisInput input = inputs.find(submissionId)
                .orElseThrow(() -> new IllegalStateException("분석 입력을 만들 수 없다: 제출 " + submissionId));
        AnswerGuard.Context guard = guards.find(submissionId)
                .orElseThrow(() -> new IllegalStateException("정답 코드 검사 자료가 없다: 제출 " + submissionId));
        return new AiReviewRunner.Generation<>(prompt.request(input), result -> AnswerGuard.check(result, guard),
                violations -> prompt.retry(input, violations));
    }

    // 남은 횟수는 결과를 만든 날이 아니라 응답하는 지금 기준이다(contracts의 SubmissionAnalysis.quota).
    private AnalysisView view(long userId, AiReviewRepository.Stored stored) {
        AiQuota today = quota.status(userId);
        if (stored.status() != AiReviewRepository.Status.COMPLETED || stored.blocked()) {
            return AnalysisView.of(stored, stored.blocked(), null, today);
        }
        return AnalysisView.of(stored, false, json.readValue(stored.content(), AnalysisResult.class), today);
    }

    private String version() {
        return llm.promptVersion(ReviewType.ANALYSIS);
    }

    private static RuntimeException notFound() {
        return ApiErrors.error(HttpStatus.NOT_FOUND, "ANALYSIS_NOT_FOUND", "AI 분석을 찾을 수 없어요");
    }
}
