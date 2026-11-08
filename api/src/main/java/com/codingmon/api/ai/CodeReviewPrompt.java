package com.codingmon.api.ai;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.codingmon.api.judge.Verdict;

// AI 코드 리뷰(F3)의 프롬프트. prompts/code-review-<버전>/system.md를 시스템 지시로, CodeReviewInput JSON을 사용자 메시지로 보낸다.
// 정답 제출만 리뷰하므로 판정별 지시는 없다. 버전은 LlmClient.promptVersion(CODE_REVIEW)이고 ai_reviews.prompt_version에도 이 값이
// 남는다. 프롬프트를 고치면 새 버전 폴더를 만들고 LLM_PROMPT_VERSION_CODE_REVIEW를 올린다(이전 결과를 재사용하지 않게, AI_FEATURES 8절).
@Component
class CodeReviewPrompt {

    private final String system;
    // 정답 코드 검사(AnswerGuard)에 걸려 다시 만들 때 시스템 지시 뒤에 붙인다. {{violations}}에 어긴 규칙이 들어간다.
    private final String retry;

    // 버전은 LlmClient에서 받는다. ai_reviews.prompt_version에 남는 값과 읽는 폴더가 어긋나지 않게 출처를 하나로 둔다.
    @Autowired
    CodeReviewPrompt(LlmClient llm) {
        this(llm.promptVersion(ReviewType.CODE_REVIEW));
    }

    CodeReviewPrompt(String version) {
        String folder = "prompts/code-review-" + version + "/";
        system = PromptFiles.read(folder + "system.md").strip() + "\n";
        retry = PromptFiles.read(folder + "retry.md").strip();
    }

    // 정답 코드 검사에 걸린 뒤 한 번 다시 만들 요청. 어긴 규칙을 알려 주고 지시를 강화한다. 앞서 만든 리뷰 글은 다시 보내지 않는다.
    LlmRequest<CodeReviewResult> retry(CodeReviewInput input, List<AnswerGuard.Violation> violations) {
        LlmRequest<CodeReviewResult> first = request(input);
        return new LlmRequest<>(PromptFiles.withRetry(first.system(), retry, violations), first.user(),
                first.schemaName(), first.schema(), first.responseType());
    }

    // 오답은 리뷰하지 않는다(F1 오답 분석이 따로 있다).
    LlmRequest<CodeReviewResult> request(CodeReviewInput input) {
        Verdict verdict = input.submission().verdict();
        if (verdict != Verdict.ACCEPTED) {
            throw new IllegalArgumentException("정답이 아닌 제출은 리뷰하지 않는다: " + verdict);
        }
        return new LlmRequest<>(system, input.toJson(), CodeReviewResult.SCHEMA_NAME, CodeReviewResult.SCHEMA,
                CodeReviewResult.class);
    }
}
