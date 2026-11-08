package com.codingmon.api.ai;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.codingmon.api.ApiErrors;

import tools.jackson.databind.json.JsonMapper;

// AI 코드 리뷰(F3, AI_FEATURES 6절). 정답(ACCEPTED)을 받은 본인 채점 제출에만 요청할 때 한 번 만들어 ai_reviews(CODE_REVIEW)에 저장한다.
// 같은 제출·같은 프롬프트 버전의 결과는 다시 만들지 않는다(8절). 만드는 흐름(처리기, 정답 코드 검사와 1회 재생성, 차단 저장,
// 사실 검증)은 AiReviewRunner가, 분석과 합친 하루 한도는 AiQuotaService가 맡는다(#80). 사실 검증은 줄 번호 범위만 본다(#79). 다음 개념의 개념 태그 매칭은 #83이 한다.
// 리뷰는 힌트가 없으므로 revealed_hint_level은 0으로 남고 풀이 통계(user_problem_stats)도 바꾸지 않는다.
@Service
class CodeReviewService {

    // 요청 결과. started면 이 요청이 새 시도를 시작했다.
    record Requested(CodeReviewView view, boolean started) {
    }

    private final AiReviewRepository reviews;
    private final AnalysisInputRepository inputs;
    private final AnswerGuardRepository guards;
    private final CodeReviewPrompt prompt;
    private final AiReviewRunner runner;
    private final LlmClient llm;
    private final JsonMapper json;
    private final AiQuotaService quota;

    CodeReviewService(AiReviewRepository reviews, AnalysisInputRepository inputs, AnswerGuardRepository guards,
            CodeReviewPrompt prompt, AiReviewRunner runner, LlmClient llm, JsonMapper json, AiQuotaService quota) {
        this.reviews = reviews;
        this.inputs = inputs;
        this.guards = guards;
        this.prompt = prompt;
        this.runner = runner;
        this.llm = llm;
        this.json = json;
        this.quota = quota;
    }

    // 제출과 판정을 먼저 확인한다. 정답이 아니면 한도와 상관없이 409다. 시도를 잡는 일만 하루 한도 검사와 한 트랜잭션에서 하고
    // (AiQuotaService.claimWithin), 처리기에는 그 트랜잭션이 커밋된 뒤에 넣는다(AnalysisService.request와 같다).
    Requested request(long userId, long submissionId) {
        AiReviewRepository.Target target = reviews.findTarget(userId, submissionId)
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "SUBMISSION_NOT_FOUND", "제출을 찾을 수 없어요"));
        if (!"COMPLETED".equals(target.jobStatus()) || !"ACCEPTED".equals(target.verdict())) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "CODE_REVIEW_NOT_AVAILABLE", "정답 판정을 받은 제출만 리뷰할 수 있어요");
        }
        String version = version();
        boolean started = quota.claimWithin(userId, submissionId,
                () -> reviews.claim(submissionId, ReviewType.CODE_REVIEW, version, llm.model(), runner.abandoned()))
                .map(claim -> {
                    runner.start(ReviewType.CODE_REVIEW, claim, () -> generation(submissionId));
                    return claim;
                })
                .isPresent();
        AiReviewRepository.Stored stored = reviews.findShown(userId, submissionId, ReviewType.CODE_REVIEW, version,
                runner.abandoned())
                .orElseThrow(() -> new IllegalStateException("만든 AI 코드 리뷰 행이 없다: 제출 " + submissionId));
        return new Requested(view(userId, stored), started);
    }

    // 결과 화면의 폴링과 제출 기록이 부른다. 프롬프트 버전이 여럿이면 분석과 같은 규칙(AiReviewRepository.findShown)으로 고른다.
    CodeReviewView find(long userId, long submissionId) {
        return reviews.findShown(userId, submissionId, ReviewType.CODE_REVIEW, version(), runner.abandoned())
                .map(stored -> view(userId, stored))
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "CODE_REVIEW_NOT_FOUND", "AI 리뷰를 찾을 수 없어요"));
    }

    // 처리기에 넣을 요청. 입력(문제와 제출만)과 정답 코드 검사 자료를 읽는다. 읽지 못하면 던지고, runner가 행을 FAILED로 바꾼다.
    // 검증 정답 코드는 검사에만 쓰고 모델에는 보내지 않는다.
    private AiReviewRunner.Generation<CodeReviewResult> generation(long submissionId) {
        CodeReviewInput input = inputs.findReview(submissionId)
                .orElseThrow(() -> new IllegalStateException("리뷰 입력을 만들 수 없다: 제출 " + submissionId));
        AnswerGuard.Context guard = guards.find(submissionId)
                .orElseThrow(() -> new IllegalStateException("정답 코드 검사 자료가 없다: 제출 " + submissionId));
        int codeLines = input.submission().codeLines();
        return new AiReviewRunner.Generation<>(prompt.request(input), result -> AnswerGuard.check(result, guard),
                violations -> prompt.retry(input, violations), result -> FactCheck.verify(result, codeLines));
    }

    // 남은 횟수는 결과를 만든 날이 아니라 응답하는 지금 기준이다(contracts의 SubmissionCodeReview.quota).
    private CodeReviewView view(long userId, AiReviewRepository.Stored stored) {
        AiQuota today = quota.status(userId);
        if (stored.status() != AiReviewRepository.Status.COMPLETED || stored.blocked()) {
            return CodeReviewView.of(stored, stored.blocked(), null, today);
        }
        return CodeReviewView.of(stored, false, json.readValue(stored.content(), CodeReviewResult.class), today);
    }

    private String version() {
        return llm.promptVersion(ReviewType.CODE_REVIEW);
    }
}
