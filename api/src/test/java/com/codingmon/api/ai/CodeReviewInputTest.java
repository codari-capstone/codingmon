package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.codingmon.api.Language;
import com.codingmon.api.ai.AnalysisInput.HiddenCase;
import com.codingmon.api.ai.AnalysisInput.HiddenTests;
import com.codingmon.api.ai.AnalysisInput.Problem;
import com.codingmon.api.ai.AnalysisInput.Sample;
import com.codingmon.api.ai.AnalysisInput.Samples;
import com.codingmon.api.ai.AnalysisInput.Submission;
import com.codingmon.api.judge.Verdict;

class CodeReviewInputTest {

    private static final Problem PROBLEM = Problem.of("곱셈", "A×B를 출력하세요.", "A와 B", "A×B", "0 < A, B < 10", 1000, 128,
            List.of("입출력"));
    private static final Submission SUBMISSION = Submission.of(Language.PYTHON, Verdict.ACCEPTED, null, 12, 9000,
            "a, b = map(int, input().split())\nprint(a * b)\n", null);

    @Test
    void 분석_입력에서_문제와_제출만_가져온다() {
        AnalysisInput analysis = new AnalysisInput(PROBLEM, SUBMISSION,
                Samples.of(List.of(Sample.of(1, Verdict.ACCEPTED, null, "2 3\n", "6\n", "6\n", null, 12, 9000))),
                HiddenTests.of(List.of(new HiddenCase(Verdict.ACCEPTED, null, 4))));

        CodeReviewInput input = CodeReviewInput.of(analysis);

        assertThat(input.problem()).isSameAs(PROBLEM);
        assertThat(input.submission()).isSameAs(SUBMISSION);
        // 정답 제출이라 예제와 비공개 테스트는 모두 통과했다. 보낼 것이 없다.
        assertThat(input.toJson()).doesNotContain("\"samples\"", "\"hiddenTests\"", "\"expectedOutput\"");
    }

    @Test
    void JSON은_분석_입력과_같은_규칙으로_쓴다() {
        String json = new CodeReviewInput(PROBLEM, SUBMISSION).toJson();

        // 선언 순서 그대로, 빈 값(compilerMessage, runtimeErrorType)은 빠진다.
        assertThat(json).containsSubsequence("\"problem\"", "\"title\"", "\"conceptTags\"", "\"submission\"", "\"language\"",
                "\"verdict\"", "\"codeLines\"", "\"code\"");
        assertThat(json).doesNotContain("compilerMessage", "runtimeErrorType", "null");
        assertThat(json).contains("\"code\":\"1| a, b = map(int, input().split())\\n2| print(a * b)\\n\"");
    }
}
