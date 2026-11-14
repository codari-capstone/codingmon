package com.codingmon.api.ai;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

// 학습 리포트(F4)의 프롬프트. prompts/learning-report-<버전>/system.md를 시스템 지시로, LearningReportInput JSON을 사용자 메시지로 보낸다.
// 버전은 LlmClient.promptVersion(LEARNING_REPORT)이다. 리포트는 하루 1회 새로 만들어 이전 결과를 재사용하지 않지만, 고칠 때는
// 다른 기능과 같이 새 버전 폴더를 만들고 LLM_PROMPT_VERSION_LEARNING_REPORT를 올린다(평가 결과와 프롬프트를 짝지어 남긴다).
// 리포트에는 코드를 쓸 자리가 없어 정답 코드 검사(AnswerGuard)와 다시 쓰기 지시(retry.md)가 없다.
@Component
class LearningReportPrompt {

    private final String system;

    // 버전은 LlmClient에서 받는다. 설정값과 읽는 폴더가 어긋나지 않게 출처를 하나로 둔다.
    @Autowired
    LearningReportPrompt(LlmClient llm) {
        this(llm.promptVersion(ReviewType.LEARNING_REPORT));
    }

    LearningReportPrompt(String version) {
        system = PromptFiles.read("prompts/learning-report-" + version + "/system.md").strip() + "\n";
    }

    // 스키마는 입력마다 만든다(취약 개념·추천의 개수와 이름·순위, LearningReportResult.schema).
    LlmRequest<LearningReportResult> request(LearningReportInput input) {
        return new LlmRequest<>(system, input.toJson(), LearningReportResult.SCHEMA_NAME, LearningReportResult.schema(input),
                LearningReportResult.class);
    }
}
