package com.codingmon.api.ai;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.codingmon.api.judge.Verdict;

// AI 코드 리뷰(F3)의 프롬프트. prompts/code-review-<버전>/system.md를 시스템 지시로, CodeReviewInput JSON을 사용자 메시지로 보낸다.
// 정답 제출만 리뷰하므로 판정별 지시는 없다. 버전은 LlmClient.promptVersion(CODE_REVIEW)이고 ai_reviews.prompt_version에도 이 값이
// 남는다. 프롬프트를 고치면 새 버전 폴더를 만들고 LLM_PROMPT_VERSION_CODE_REVIEW를 올린다(이전 결과를 재사용하지 않게, AI_FEATURES 8절).
@Component
class CodeReviewPrompt {

    private final String system;

    // 버전은 LlmClient에서 받는다. ai_reviews.prompt_version에 남는 값과 읽는 폴더가 어긋나지 않게 출처를 하나로 둔다.
    @Autowired
    CodeReviewPrompt(LlmClient llm) {
        this(llm.promptVersion(ReviewType.CODE_REVIEW));
    }

    CodeReviewPrompt(String version) {
        system = PromptFiles.read("prompts/code-review-" + version + "/system.md").strip() + "\n";
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
