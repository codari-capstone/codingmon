package com.codingmon.api.ai;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.codingmon.api.judge.Verdict;

// AI 오답 분석(F1·F2)의 프롬프트. prompts/analysis-<버전>/의 system.md 뒤에 판정별 지시(<판정>.md)를 붙여 시스템 지시로,
// AnalysisInput JSON을 사용자 메시지로 보낸다. 버전은 LlmClient.promptVersion(ANALYSIS)이고 ai_reviews.prompt_version에도 이 값이
// 남는다. 프롬프트를 고치면 새 버전 폴더를 만들고 LLM_PROMPT_VERSION_ANALYSIS를 올린다(이전 결과를 재사용하지 않게, AI_FEATURES 8절).
// 파일이 하나라도 없으면 서버가 뜨지 않는다. 호출할 때 처음 알게 되면 그 판정의 분석만 계속 실패한다.
@Component
class AnalysisPrompt {

    private static final String SYSTEM_FILE = "system.md";
    // 정답 코드 검사(#78)에 걸려 다시 만들 때 시스템 지시 뒤에 붙인다. {{violations}}에 어긴 규칙이 들어간다.
    private static final String RETRY_FILE = "retry.md";

    private final Map<Verdict, String> systems = new EnumMap<>(Verdict.class);
    private final String retry;

    // 버전은 LlmClient에서 받는다. ai_reviews.prompt_version에 남는 값과 읽는 폴더가 어긋나지 않게 출처를 하나로 둔다.
    @Autowired
    AnalysisPrompt(LlmClient llm) {
        this(llm.promptVersion(ReviewType.ANALYSIS));
    }

    AnalysisPrompt(String version) {
        String common = read(version, SYSTEM_FILE);
        for (Verdict verdict : Verdict.values()) {
            if (verdict != Verdict.ACCEPTED) {
                systems.put(verdict, common.strip() + "\n\n" + read(version, verdict.name() + ".md").strip() + "\n");
            }
        }
        retry = read(version, RETRY_FILE).strip();
    }

    // 정답 코드 검사에 걸린 뒤 한 번 다시 만들 요청. 어긴 규칙을 알려 주고 지시를 강화한다. 응답 글은 다시 보내지 않는다.
    LlmRequest<AnalysisResult> retry(AnalysisInput input, List<AnswerGuard.Violation> violations) {
        LlmRequest<AnalysisResult> first = request(input);
        return new LlmRequest<>(PromptFiles.withRetry(first.system(), retry, violations), first.user(),
                first.schemaName(), first.schema(), first.responseType());
    }

    // 맞았습니다는 분석하지 않는다(F3 코드 리뷰가 따로 있다).
    LlmRequest<AnalysisResult> request(AnalysisInput input) {
        Verdict verdict = input.submission().verdict();
        String system = systems.get(verdict);
        if (system == null) {
            throw new IllegalArgumentException("오답이 아닌 제출은 분석하지 않는다: " + verdict);
        }
        return new LlmRequest<>(system, input.toJson(), AnalysisResult.SCHEMA_NAME, AnalysisResult.SCHEMA,
                AnalysisResult.class);
    }

    private static String read(String version, String file) {
        return PromptFiles.read("prompts/analysis-" + version + "/" + file);
    }
}
