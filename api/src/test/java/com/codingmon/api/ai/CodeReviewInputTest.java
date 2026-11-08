package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.codingmon.api.Language;
import com.codingmon.api.ai.AnalysisInput.Problem;
import com.codingmon.api.ai.AnalysisInput.Submission;
import com.codingmon.api.judge.Verdict;

// 코드 리뷰 입력의 JSON 규칙. 예제·비공개 테스트를 읽지 않는 것은 AnalysisInputRepositoryTest가 실제 DB로 본다.
class CodeReviewInputTest {

    private static final Problem PROBLEM = Problem.of("곱셈", "A×B를 출력하세요.", "A와 B", "A×B", "0 < A, B < 10", 1000, 128,
            List.of("입출력"));
    private static final Submission SUBMISSION = Submission.of(Language.PYTHON, Verdict.ACCEPTED, null, 12, 9000,
            "a, b = map(int, input().split())\nprint(a * b)\n", null);

    @Test
    void JSON은_분석_입력과_같은_규칙으로_쓴다() {
        String json = new CodeReviewInput(PROBLEM, SUBMISSION).toJson();

        // 선언 순서 그대로, 빈 값(compilerMessage, runtimeErrorType)은 빠진다. 예제·비공개 요약은 담을 필드가 없다.
        assertThat(json).containsSubsequence("\"problem\"", "\"title\"", "\"conceptTags\"", "\"submission\"", "\"language\"",
                "\"verdict\"", "\"codeLines\"", "\"code\"");
        assertThat(json).doesNotContain("compilerMessage", "runtimeErrorType", "null", "\"samples\"", "\"hiddenTests\"");
        assertThat(json).contains("\"code\":\"1| a, b = map(int, input().split())\\n2| print(a * b)\\n\"");
    }
}
