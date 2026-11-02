package com.codingmon.api.ai;

import static com.codingmon.api.ai.AnalysisInput.SizeGrade.LARGE;
import static com.codingmon.api.ai.AnalysisInput.SizeGrade.MEDIUM;
import static com.codingmon.api.ai.AnalysisInput.SizeGrade.SMALL;
import static com.codingmon.api.judge.Verdict.ACCEPTED;
import static com.codingmon.api.judge.Verdict.RUNTIME_ERROR;
import static com.codingmon.api.judge.Verdict.TIME_LIMIT_EXCEEDED;
import static com.codingmon.api.judge.Verdict.WRONG_ANSWER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

import com.codingmon.api.Language;
import com.codingmon.api.ai.AnalysisInput.HiddenCase;
import com.codingmon.api.ai.AnalysisInput.HiddenTests;
import com.codingmon.api.ai.AnalysisInput.Problem;
import com.codingmon.api.ai.AnalysisInput.Sample;
import com.codingmon.api.ai.AnalysisInput.SizeGroup;
import com.codingmon.api.ai.AnalysisInput.Submission;
import com.codingmon.api.judge.RuntimeErrorType;
import com.codingmon.api.judge.Verdict;

class AnalysisInputTest {

    @Test
    void 코드에_줄_번호를_붙이고_전체_줄_수를_남긴다() {
        Submission submission = Submission.of(Language.PYTHON, WRONG_ANSWER, null, 12, 9000, "a = 1\r\nprint(a)\n", null);

        assertThat(submission.code()).isEqualTo("1| a = 1\n2| print(a)\n");
        assertThat(submission.codeLines()).isEqualTo(2);
    }

    @Test
    void 코드가_상한을_넘으면_줄_단위로_자른다() {
        assertThat(AnalysisInput.numberLines("x\n".repeat(AnalysisInput.CODE_MAX_LINES + 5)))
                .endsWith(AnalysisInput.CODE_MAX_LINES + "| x\n[…뒤 5줄 생략]\n");

        String numbered = AnalysisInput.numberLines(("가".repeat(99) + "\n").repeat(200));
        List<String> lines = numbered.lines().toList();
        assertThat(numbered.codePointCount(0, numbered.length())).isLessThan(AnalysisInput.CODE_MAX_CHARS + 20);
        assertThat(lines.subList(0, lines.size() - 1)).allMatch(line -> line.matches("\\d+\\| 가{99}"));
        assertThat(lines.getLast()).isEqualTo("[…뒤 " + (200 - (lines.size() - 1)) + "줄 생략]");

        // 긴 줄 하나는 그 줄만 자르고 뒤 줄은 남긴다.
        assertThat(AnalysisInput.numberLines("x".repeat(1_000) + "\nprint(1)\n"))
                .isEqualTo("1| " + "x".repeat(AnalysisInput.CODE_LINE_MAX_CHARS) + " […뒤 700자 생략]\n2| print(1)\n");
    }

    @Test
    void 글은_코드_포인트_기준으로_자르고_남은_글자_수를_적는다() {
        assertThat(AnalysisInput.clip("😀😀😀", 2)).isEqualTo("😀😀\n[…뒤 1자 생략]");
        assertThat(AnalysisInput.clip("abc", 3)).isEqualTo("abc");
        assertThat(AnalysisInput.clip(null, 3)).isNull();
    }

    @Test
    void 예제가_상한보다_많으면_틀린_예제부터_고른다() {
        List<Sample> samples = List.of(sample(1, ACCEPTED), sample(2, ACCEPTED), sample(3, ACCEPTED), sample(4, WRONG_ANSWER));

        assertThat(Sample.pick(samples)).extracting(Sample::no).containsExactly(1, 2, 4);
    }

    @Test
    void 예제_stderr에서_채점_서버가_붙인_줄은_뺀다() {
        Sample sample = Sample.of(1, RUNTIME_ERROR, RuntimeErrorType.INDEX_ERROR, "1\n", "1\n", "",
                "run: line 1:     3 Segmentation fault      (core dumped) ./a.out\n", 5, 900);

        assertThat(sample.errorMessage()).isNull();
    }

    @Test
    void 입력_크기를_로그_눈금으로_셋으로_나눈다() {
        assertThat(AnalysisInput.grades(List.of(4, 6, 50, 5_000, 600_000)))
                .containsExactly(SMALL, SMALL, SMALL, MEDIUM, LARGE);
        assertThat(AnalysisInput.grades(List.of(10, 10))).containsExactly(MEDIUM, MEDIUM);
    }

    @Test
    void 비공개_요약은_개수와_판정과_크기_등급만_담는다() {
        HiddenTests hidden = HiddenTests.of(List.of(
                new HiddenCase(ACCEPTED, null, 4),
                new HiddenCase(ACCEPTED, null, 50),
                new HiddenCase(WRONG_ANSWER, null, 5_000),
                new HiddenCase(RUNTIME_ERROR, RuntimeErrorType.INDEX_ERROR, 600_000),
                new HiddenCase(TIME_LIMIT_EXCEEDED, null, 600_000)));

        assertThat(hidden.total()).isEqualTo(5);
        assertThat(hidden.passed()).isEqualTo(2);
        assertThat(hidden.failed()).isEqualTo(3);
        assertThat(hidden.failedVerdicts())
                .containsExactly(entry(WRONG_ANSWER, 1), entry(TIME_LIMIT_EXCEEDED, 1), entry(RUNTIME_ERROR, 1));
        assertThat(hidden.runtimeErrorTypes()).containsExactly(RuntimeErrorType.INDEX_ERROR);
        assertThat(hidden.bySize()).containsExactly(new SizeGroup(SMALL, 2, 0), new SizeGroup(MEDIUM, 0, 1),
                new SizeGroup(LARGE, 0, 2));
        assertThat(hidden.smallestFailed()).isFalse();
        assertThat(hidden.largestFailed()).isTrue();
    }

    @Test
    void 입력_크기가_모두_같으면_가장_작은_입력과_큰_입력을_표시하지_않는다() {
        HiddenTests hidden = HiddenTests.of(List.of(new HiddenCase(WRONG_ANSWER, null, 8), new HiddenCase(ACCEPTED, null, 8)));

        assertThat(hidden.bySize()).containsExactly(new SizeGroup(MEDIUM, 1, 1));
        assertThat(hidden.smallestFailed()).isFalse();
        assertThat(hidden.largestFailed()).isFalse();
        assertThat(HiddenTests.of(List.of())).isNull();
    }

    @Test
    void JSON은_빈_값을_빼고_선언_순서를_지킨다() {
        AnalysisInput input = new AnalysisInput(Problem.of("A+B", "두 수를 더한다", "a b", "a+b", "", 1000, 256, List.of("구현")),
                Submission.of(Language.PYTHON, WRONG_ANSWER, null, 12, 9000, "print(1)", null), List.of(), null);

        assertThat(input.toJson()).startsWith("{\"problem\":{\"title\":\"A+B\",\"statement\":\"두 수를 더한다\"")
                .contains("\"submission\":{\"language\":\"PYTHON\",\"verdict\":\"WRONG_ANSWER\"")
                .contains("\"code\":\"1| print(1)\\n\"")
                .doesNotContain("runtimeErrorType", "compilerMessage", "hiddenTests");
    }

    @Test
    void 모든_글이_상한에_닿아도_JSON은_2만_자를_넘지_않는다() {
        String korean = "입력으로 주어진 수열에서 조건을 만족하는 구간의 개수를 구한다. ".repeat(500);
        String code = "for i in range(n):  # 앞에서부터 합을 더한다\n    total += a[i] * b[i]\n".repeat(1_000);
        String output = "1 2 3 4 5 6 7 8 9 10\n".repeat(100);
        String traceback = "Traceback (most recent call last):\n  File \"main.py\", line 3, in <module>\n".repeat(50);
        List<Sample> samples = IntStream.rangeClosed(1, 5)
                .mapToObj(no -> Sample.of(no, WRONG_ANSWER, null, output, output, output, traceback, 10, 100))
                .toList();
        AnalysisInput input = new AnalysisInput(
                Problem.of(korean.substring(0, 200), korean, korean, korean, korean, 1000, 256,
                        List.of("그리디", "동적 계획법", "그래프 탐색")),
                Submission.of(Language.PYTHON, WRONG_ANSWER, null, 1000, 262_144, code, null),
                Sample.pick(samples),
                HiddenTests.of(IntStream.range(0, 50)
                        .mapToObj(i -> new HiddenCase(i % 2 == 0 ? ACCEPTED : WRONG_ANSWER, null, i * 1000)).toList()));

        String json = input.toJson();
        assertThat(json.length()).isLessThanOrEqualTo(20_000);
        assertThat(json).contains("자 생략]", "줄 생략]");
    }

    private static Sample sample(int no, Verdict verdict) {
        return Sample.of(no, verdict, null, "1\n", "1\n", "1\n", null, 1, 1);
    }
}
