package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.codingmon.api.Language;
import com.codingmon.api.ai.FactCheck.Action;
import com.codingmon.api.ai.FactCheck.Fix;
import com.codingmon.api.ai.FactCheck.Kind;
import com.codingmon.api.judge.Verdict;

class FactCheckTest {

    private static final AnalysisResult.Hints HINTS = new AnalysisResult.Hints("힌트 1", "힌트 2", "힌트 3");

    // ===== 실제 응답 =====

    @Test
    void 실제_모델의_정상_응답은_고치지_않는다() {
        // AnalysisPromptTest.PYRAMID_ANSWER
        AnalysisResult pyramid = new AnalysisResult("별 개수가 줄마다 줄어야 하는데 늘어나고 있어요.", List.of(4, 5),
                List.of("공개 예제 1에서 기대 출력은 줄마다 별이 5개, 3개, 1개로 줄어드는데, 제출 코드의 출력은 1개, 3개, 5개로 늘어납니다."),
                List.of("4번째 줄의 반복과 별 개수 식이 정방향 기준으로 작성된 것 같습니다."),
                new AnalysisResult.Hints("예제 출력의 첫 줄과 마지막 줄 별 개수를 세어 보세요. 내 출력과 순서가 어떻게 다른가요?",
                        "줄 번호 i가 커질 때 별 개수가 어떻게 변해야 하는지 식으로 적어 보세요.",
                        "정방향 별 개수 2i − 1에서 i 자리에 n − i + 1을 넣으면 별은 2(n − i) + 1개, 앞 공백은 i − 1개가 됩니다."));
        // AnswerGuardTest의 실제 gemma4:12b 응답
        AnalysisResult gemma = new AnalysisResult("별의 개수가 줄어드는 것이 아니라 늘어나도록 계산되었습니다.", List.of(4),
                List.of("예제 1번에서 기대 출력은 첫 줄 별 5개, 두 번째 줄 별 3개, 세 번째 줄 별 1개이지만, 실제 출력은 첫 줄 별 1개,"
                        + " 두 번째 줄 별 3개, 세 번째 줄 별 5개로 출력되었습니다."),
                List.of("4번 줄에서 i가 1부터 n까지 증가하도록 설정되어 있어 별의 개수가 줄어들지 않는 것 같습니다.",
                        "4번 줄의 range(1, n + 1) 때문에 첫 줄의 별이 가장 적은 것 같습니다."),
                new AnalysisResult.Hints(
                        "예제 1번의 실제 출력과 기대 출력을 비교하여 별의 개수가 줄어드는 규칙이 지켜지고 있는지 확인해 보세요.",
                        "반복문에서 i가 줄어드는 방향으로 변하게 하거나, 5번 줄의 공백과 별의 개수를 계산하는 수식을 수정해야 합니다.",
                        "i번째 줄(i는 1부터 n까지)에서 별의 개수는 2 * (n - i) + 1개이고, 공백의 개수는 i − 1개입니다."
                                + " 예를 들어 n이 3일 때, 첫 번째 줄(i=1)은 공백 0개, 별 5개입니다."));

        for (AnalysisResult result : List.of(pyramid, gemma)) {
            FactCheck.Outcome<AnalysisResult> outcome = verify(result, AnalysisSamples.reversePyramid());
            assertThat(outcome.fixes()).isEmpty();
            assertThat(outcome.result()).isEqualTo(result);
            assertThat(outcome.label()).isEqualTo("PASSED");
        }
    }

    @Test
    void 판정별_샘플의_맞는_사실은_남긴다() {
        assertThat(fixes(AnalysisSamples.missingSemicolon(), "6번째 줄에서 ';'가 빠졌다는 컴파일 메시지가 나왔습니다.",
                "컴파일 에러라 예제를 실행하지 못했습니다.")).isEmpty();
        assertThat(fixes(AnalysisSamples.indexOutOfRange(), "예제 1에서 리스트의 없는 칸을 읽어 실행이 멈췄습니다.",
                "에러 메시지는 IndexError: list index out of range입니다.")).isEmpty();
        assertThat(fixes(AnalysisSamples.quadraticPairs(), "예제 2개는 모두 통과했지만 비공개 테스트 8개 중 2개에서 시간 초과가 났습니다.",
                "실행 시간이 3000ms로 시간 제한 1000ms를 넘었습니다.", "큰 입력에서만 실패했습니다.")).isEmpty();
        assertThat(fixes(AnalysisSamples.storeEverything(), "메모리를 131,072KB 써서 메모리 제한 128MB를 넘었습니다.")).isEmpty();
        // 단위를 바꾼 값은 그대로 써도, 어림해 써도 된다(18ms, 9,200KB)
        assertThat(fixes(AnalysisSamples.reversePyramid(), "실행 시간은 0.018초입니다.", "메모리를 8.98MB 썼습니다.",
                "메모리를 약 9MB 썼습니다.")).isEmpty();
        assertThat(fixes(AnalysisSamples.reversePyramid(), "실행 시간은 0.019초입니다."))
                .containsExactly("UNMATCHED_VALUE@facts[0]");
        // 9,200KB = 8.984375MB. 소수 셋째 자리까지 어림해 써도 된다
        assertThat(fixes(AnalysisSamples.reversePyramid(), "메모리를 약 8.984MB 썼습니다.")).isEmpty();
        // 9,272KB = 9.0546875MB
        AnalysisInput memory = new AnalysisInput(AnalysisSamples.reversePyramid().input().problem(),
                AnalysisInput.Submission.of(Language.PYTHON, Verdict.MEMORY_LIMIT_EXCEEDED, null, 18, 9272, "x = 1\n", null),
                null, null);
        assertThat(FactCheck.verify(analysis(List.of(), List.of("메모리를 9.05MB 썼습니다."), List.of()),
                FactCheck.Context.of(memory, FactCheck.Sources.NONE)).fixes()).isEmpty();
        assertThat(FactCheck.verify(analysis(List.of(), List.of("메모리를 9.06MB 썼습니다."), List.of()),
                FactCheck.Context.of(memory, FactCheck.Sources.NONE)).fixes()).extracting(Fix::kind)
                .containsExactly(Kind.UNMATCHED_VALUE);
        assertThat(fixes(AnalysisSamples.joinedOutput(), "예제 1의 기대 출력은 1 2 3인데 실제 출력은 줄마다 하나씩 3줄입니다.",
                "출력 형식이 잘못되었습니다.")).isEmpty();
    }

    // ===== 줄 번호 =====

    @Test
    void 범위_밖_의심_줄은_지운다() {
        AnalysisResult result = analysis(List.of(4, 6, 0), List.of("예제 1에서 틀렸습니다."), List.of());

        FactCheck.Outcome<AnalysisResult> outcome = verify(result, AnalysisSamples.reversePyramid());

        assertThat(outcome.result().suspectLines()).containsExactly(4);
        assertThat(outcome.fixes()).containsExactly(
                new Fix(Kind.LINE_OUT_OF_RANGE, "suspectLines[1]", Action.REMOVED),
                new Fix(Kind.LINE_OUT_OF_RANGE, "suspectLines[2]", Action.REMOVED));
        assertThat(outcome.meta()).isEqualTo(new FactCheck.Meta(FactCheck.VERSION, 2, 0, 0,
                List.of("LINE_OUT_OF_RANGE@suspectLines[1]", "LINE_OUT_OF_RANGE@suspectLines[2]")));
    }

    @Test
    void 코드_줄을_짚는_표기를_찾는다() {
        assertThat(refs("4번째 줄의 반복")).containsExactly("4-4");
        assertThat(refs("6번 줄 끝에")).containsExactly("6-6");
        assertThat(refs("3~9번 줄의 질의 처리")).containsExactly("3-9");
        assertThat(refs("３～６번째 줄")).containsExactly("3-6");
        assertThat(refs("4부터 6번째 줄")).containsExactly("4-6");
        assertThat(refs("4, 7번째 줄")).containsExactly("4-4", "7-7");
        assertThat(refs("4번째와 7번째 줄")).containsExactly("4-4", "7-7");
        assertThat(refs("코드의 12번째 줄")).containsExactly("12-12");
        assertThat(refs("4행에서")).containsExactly("4-4");
        assertThat(refs("9~3번 줄")).containsExactly("9-3");
        assertThat(refs("4번 줄이 문제입니다")).containsExactly("4-4");
        assertThat(refs("4번 줄이고 조건이 틀렸습니다")).containsExactly("4-4");
        assertThat(refs("4번 줄에서 5번 줄까지")).containsExactly("4-4", "5-5");
        assertThat(refs("4번 줄일 것 같습니다")).containsExactly("4-4");
        assertThat(refs("문제는 4번 줄입니다")).containsExactly("4-4");
        // 값이 바뀐다는 말과 코드라고 밝힌 줄은 "다르다"가 뒤에 와도 코드 줄이다
        assertThat(refs("i 값이 45번 줄에서 달라집니다")).containsExactly("45-45");
        assertThat(refs("sum 값이 35번 줄부터 달라졌습니다")).containsExactly("35-35");
        assertThat(refs("코드의 999번째 줄이 다릅니다")).containsExactly("999-999");
    }

    @ParameterizedTest
    @ValueSource(strings = {"3줄 출력", "출력이 100줄", "[…뒤 5줄 생략]", "1단계", "예제 1", "2i − 1", "10^9", "1000ms",
            "main.cpp:6:5", "두 번째 줄", "i번째 줄", "기대 출력의 3번째 줄 끝에 공백", "출력 2번째 줄", "3번째 줄에는 별이 1개",
            "3행 4열", "행렬", "실행 결과",
            // 예제 출력의 줄인지 코드 줄인지 가릴 수 없어 보지 않는다(놓쳐도 맞는 문장을 지우지 않는 쪽을 고른다).
            "예제 1에서 9번째 줄이 다릅니다",
            // "줄"로 시작하는 다른 말, 출력을 견준 말
            "반복 횟수가 100번 줄어듭니다", "1000번 줄이면 됩니다", "연산을 50번 줄였습니다",
            "이렇게 하면 반복을 1000번 줄일 수 있습니다", "비교를 100번 줄일 필요가 있습니다", "호출을 30번 줄인다", "2번째 줄바꿈이 빠졌습니다",
            "출력이 틀렸습니다. 12번째 줄부터 다릅니다", "기대한 값과 7번째 줄이 달라요"})
    void 코드_줄이_아닌_수는_줄_번호로_보지_않는다(String text) {
        assertThat(refs(text)).isEmpty();
    }

    @Test
    void 범위_밖_줄을_짚은_사실과_추정은_옮기지_않고_지운다() {
        AnalysisResult result = analysis(List.of(4),
                List.of("9번째 줄 때문에 예제 1에서 틀렸습니다.", "예제 1에서 틀렸습니다."),
                List.of("4번째와 12번째 줄이 의심스러운 것 같습니다.", "4번째 줄이 의심스러운 것 같습니다."));

        FactCheck.Outcome<AnalysisResult> outcome = verify(result, AnalysisSamples.reversePyramid());

        assertThat(outcome.result().facts()).containsExactly("예제 1에서 틀렸습니다.");
        assertThat(outcome.result().guesses()).containsExactly("4번째 줄이 의심스러운 것 같습니다.");
        assertThat(FactCheck.describe(outcome.fixes()))
                .isEqualTo("LINE_OUT_OF_RANGE@facts[0],LINE_OUT_OF_RANGE@guesses[0]");
    }

    @Test
    void 지울_수_없는_요약과_힌트의_범위_밖_줄은_그대로_두고_센다() {
        AnalysisResult result = new AnalysisResult("7번째 줄이 문제예요.", List.of(4), List.of("예제 1에서 틀렸습니다."),
                List.of(), new AnalysisResult.Hints("힌트 1", "8번 줄을 보세요.", "힌트 3"));

        FactCheck.Outcome<AnalysisResult> outcome = verify(result, AnalysisSamples.reversePyramid());

        assertThat(outcome.result()).isEqualTo(result);
        assertThat(outcome.blocked()).isFalse();
        assertThat(outcome.meta().unresolved()).isEqualTo(2);
        assertThat(FactCheck.describe(outcome.fixes()))
                .isEqualTo("LINE_OUT_OF_RANGE@summary(kept),LINE_OUT_OF_RANGE@hints.direction(kept)");
    }

    @Test
    void 줄_번호_범위는_모델에_보낸_300줄이_아니라_전체_줄_수다() {
        String code = "x = 1\n".repeat(400);
        AnalysisInput input = new AnalysisInput(AnalysisSamples.reversePyramid().input().problem(),
                AnalysisInput.Submission.of(Language.PYTHON, Verdict.WRONG_ANSWER, null, 18, 9200, code, null), null, null);
        AnalysisResult result = analysis(List.of(350, 401), List.of("틀렸습니다."), List.of("350번째 줄이 의심스러운 것 같습니다."));

        FactCheck.Outcome<AnalysisResult> outcome = FactCheck.verify(result,
                FactCheck.Context.of(input, FactCheck.Sources.NONE));

        assertThat(outcome.result().suspectLines()).containsExactly(350);
        assertThat(outcome.result().guesses()).containsExactly("350번째 줄이 의심스러운 것 같습니다.");
    }

    // ===== [사실] 대조 =====

    @Test
    void 코드를_읽고_판단한_사실은_추정으로_옮긴다() {
        AnalysisResult result = analysis(List.of(4),
                List.of("4번째 줄의 반복이 정방향 기준으로 작성되어 있습니다.", "예제 1에서 틀렸습니다."),
                List.of("짐작 하나"));

        FactCheck.Outcome<AnalysisResult> outcome = verify(result, AnalysisSamples.reversePyramid());

        assertThat(outcome.result().facts()).containsExactly("예제 1에서 틀렸습니다.");
        assertThat(outcome.result().guesses()).containsExactly("짐작 하나", "4번째 줄의 반복이 정방향 기준으로 작성되어 있습니다.");
        assertThat(outcome.fixes()).containsExactly(new Fix(Kind.UNGROUNDED_FACT, "facts[0]", Action.DEMOTED));
        assertThat(outcome.meta().demoted()).isEqualTo(1);
    }

    @Test
    void 입력에_없는_값을_쓴_사실은_예제_번호가_맞아도_옮긴다() {
        assertThat(kinds(AnalysisSamples.reversePyramid(), "예제 1에서 42를 출력했어요."))
                .containsExactly(Kind.UNMATCHED_VALUE);
        assertThat(kinds(AnalysisSamples.reversePyramid(), "예제 1의 실제 출력은 '***'였어요.")).isEmpty();
        assertThat(kinds(AnalysisSamples.reversePyramid(), "예제 1의 실제 출력은 '****'였어요."))
                .containsExactly(Kind.UNMATCHED_VALUE);
        // 지문의 수는 실행 결과가 아니다.
        assertThat(kinds(AnalysisSamples.quadraticPairs(), "비공개 테스트에서 N이 100,000일 때 시간 초과가 났습니다."))
                .containsExactly(Kind.UNMATCHED_VALUE);
    }

    @Test
    void 입력에_실린_예제_번호만_근거가_된다() {
        assertThat(kinds(AnalysisSamples.reversePyramid(), "예제 3에서 틀렸습니다.")).containsExactly(Kind.EXAMPLE_NOT_SEEN);
        assertThat(kinds(AnalysisSamples.reversePyramid(), "2번째 예제는 통과했습니다.")).isEmpty();
    }

    @Test
    void 컴파일_에러에서_예제나_비공개_실행_결과를_말하면_옮긴다() {
        assertThat(kinds(AnalysisSamples.missingSemicolon(), "예제 1에서 출력이 달랐습니다."))
                .containsExactly(Kind.EXAMPLE_NOT_RUN);
        assertThat(kinds(AnalysisSamples.missingSemicolon(), "비공개 테스트 3개에서 틀렸습니다."))
                .containsExactly(Kind.CONTRADICTED_FACT);
    }

    @Test
    void 실행_결과와_어긋나는_사실은_옮긴다() {
        // 입력에 없는 판정
        assertThat(kinds(AnalysisSamples.reversePyramid(), "예제 1에서 시간 초과가 났습니다.")).containsExactly(Kind.CONTRADICTED_FACT);
        // 예제 하나가 틀렸다
        assertThat(kinds(AnalysisSamples.reversePyramid(), "예제를 모두 통과했습니다.")).containsExactly(Kind.CONTRADICTED_FACT);
        // 뒤에 부정이 붙으면 모두 그렇지는 않다는 뜻이다
        assertThat(kinds(AnalysisSamples.reversePyramid(), "예제를 모두 통과하지는 못했습니다.")).isEmpty();
        assertThat(kinds(AnalysisSamples.reversePyramid(), "예제가 모두 틀린 것은 아닙니다.")).isEmpty();
        assertThat(kinds(AnalysisSamples.quadraticPairs(), "예제를 모두 통과하지는 못했습니다."))
                .containsExactly(Kind.CONTRADICTED_FACT);
        assertThat(kinds(AnalysisSamples.quadraticPairs(), "예제가 모두 틀린 것은 아닙니다.")).isEmpty();
        // 뒷 절의 부정은 앞 절의 "모두 통과"를 뒤집지 않는다
        assertThat(kinds(AnalysisSamples.quadraticPairs(), "예제를 모두 통과했지만 정답은 아닙니다.")).isEmpty();
        assertThat(kinds(AnalysisSamples.quadraticPairs(), "예제를 모두 통과했고 정답은 아닙니다.")).isEmpty();
        assertThat(kinds(AnalysisSamples.quadraticPairs(), "예제를 모두 통과했으며 정답은 아닙니다.")).isEmpty();
        assertThat(kinds(AnalysisSamples.reversePyramid(), "예제를 모두 통과하지 못했고 비공개에서도 틀렸습니다.")).isEmpty();
        assertThat(kinds(AnalysisSamples.reversePyramid(), "예제를 모두 통과했지만 정답은 아닙니다."))
                .containsExactly(Kind.CONTRADICTED_FACT);
        // 비공개 요약이 없다
        assertThat(kinds(AnalysisSamples.indexOutOfRange(), "비공개 테스트 3개에서 틀렸습니다.")).containsExactly(Kind.CONTRADICTED_FACT);
        // 비공개 개수가 다르다
        assertThat(kinds(AnalysisSamples.quadraticPairs(), "비공개 테스트 8개 중 7개에서 시간 초과가 났습니다."))
                .containsExactly(Kind.CONTRADICTED_FACT);
        // 크기가 모두 비슷해 가장 작은 입력을 가릴 수 없다(AnalysisSamples의 forbidden)
        for (String forbidden : List.of("가장 작은 입력은 통과했습니다.", "가장 작은 입력에서는 통과했습니다.")) {
            assertThat(kinds(AnalysisSamples.hiddenOnlyTrailingSpace(), forbidden)).containsExactly(Kind.CONTRADICTED_FACT);
        }
        // 가장 큰 입력에서 실패했다는 표시와 같다
        assertThat(kinds(AnalysisSamples.quadraticPairs(), "가장 큰 입력에서 실패했습니다.")).isEmpty();
        assertThat(kinds(AnalysisSamples.quadraticPairs(), "가장 작은 입력에서 실패했습니다.")).containsExactly(Kind.CONTRADICTED_FACT);
    }

    @Test
    void 사실이_모두_옮겨져도_결과를_만든다() {
        AnalysisResult result = analysis(List.of(), List.of("반복문이 n번 돕니다.", "변수 이름이 짧습니다."),
                List.of("1", "2", "3", "4", "5"));

        FactCheck.Outcome<AnalysisResult> outcome = verify(result, AnalysisSamples.reversePyramid());

        assertThat(outcome.result().facts()).isEmpty();
        assertThat(outcome.result().guesses()).containsExactly("1", "2", "3", "4", "5", "반복문이 n번 돕니다.", "변수 이름이 짧습니다.");
    }

    // ===== 비공개 값 =====

    private static final FactCheck.Sources HIDDEN = new FactCheck.Sources(
            List.of("5\n10 20 30 40 50\n", "150\n", "3\n1 2 3\n", "1 2 3 4 5 6\n", "7 7 7 7 7\n", "안녕 하세요 세상\n"),
            List.of("정수 N개의 합", "3\n1 2 3\n6\n"));

    @Test
    void 비공개_값이_든_항목은_지운다() {
        AnalysisResult result = analysis(List.of(),
                List.of("예제 1에서 틀렸습니다.", "비공개 입력 10 20 30 40 50에서 틀렸습니다."),
                List.of("입력이 20, 30, 40, 50일 때 틀린 것 같습니다.", "안녕 하세요 세상을 출력해야 할 것 같습니다.", "3번째 줄 같습니다."));

        FactCheck.Outcome<AnalysisResult> outcome = verify(result, AnalysisSamples.reversePyramid(), HIDDEN);

        assertThat(outcome.result().facts()).containsExactly("예제 1에서 틀렸습니다.");
        assertThat(outcome.result().guesses()).containsExactly("3번째 줄 같습니다.");
        assertThat(outcome.blocked()).isFalse();
        assertThat(FactCheck.describe(outcome.fixes()))
                .isEqualTo("HIDDEN_VALUE@facts[1],HIDDEN_VALUE@guesses[0],HIDDEN_VALUE@guesses[1]");
    }

    @Test
    void 요약이나_힌트에_비공개_값이_있으면_차단한다() {
        AnalysisResult result = new AnalysisResult("요약", List.of(), List.of("예제 1에서 틀렸습니다."), List.of(),
                new AnalysisResult.Hints("힌트 1", "10 20 30 40을 넣어 보세요.", "힌트 3"));

        FactCheck.Outcome<AnalysisResult> outcome = verify(result, AnalysisSamples.reversePyramid(), HIDDEN);

        assertThat(outcome.blocked()).isTrue();
        assertThat(outcome.label()).isEqualTo("BLOCKED");
        assertThat(FactCheck.describe(outcome.fixes())).isEqualTo("HIDDEN_VALUE@hints.direction(blocked)");
        assertThat(outcome.meta().removed()).isEqualTo(1);
    }

    @Test
    void 값_하나짜리_비공개_기대_출력도_본다() {
        FactCheck.Sources sources = new FactCheck.Sources(List.of("12\n", "6227020800\n", "1234567\n"), List.of());

        assertThat(blocked(sources, "정답은 6227020800이에요.")).isTrue();
        // 값 하나는 8자 이상만 본다
        assertThat(blocked(sources, "1234567을 출력해 보세요.")).isFalse();
    }

    @Test
    void 한글_조사가_붙어_지문에_나온_값은_비공개_값으로_보지_않는다() {
        FactCheck.Sources sources = new FactCheck.Sources(List.of("3\n", "No Solution\n", "2\n", "IMPOSSIBLE\n"),
                List.of("해가 없으면 No Solution을 출력한다. 만들 수 없으면 IMPOSSIBLE을 출력한다."));

        assertThat(blocked(sources, "No Solution을 출력하는 경우를 먼저 확인해 보세요.")).isFalse();
        assertThat(blocked(sources, "IMPOSSIBLE을 출력해야 하는 조건을 떠올려 보세요.")).isFalse();
        // 지문에 없으면 비공개 값이다
        FactCheck.Sources secret = new FactCheck.Sources(List.of("IMPOSSIBLE\n"), List.of("답을 출력한다."));
        assertThat(blocked(secret, "IMPOSSIBLE을 출력해야 하는 조건을 떠올려 보세요.")).isTrue();
    }

    @Test
    void 쉼표로_붙여_쓴_목록도_비공개_값과_맞춰_본다() {
        FactCheck.Sources sources = new FactCheck.Sources(List.of("100 200 300 400\n", "10000000\n"), List.of());

        assertThat(blocked(sources, "[100,200,300,400]을 넣어 보세요.")).isTrue();
        // 천 단위 쉼표는 지워서 맞춘다
        assertThat(blocked(sources, "답이 10,000,000이 되는지 보세요.")).isTrue();
    }

    @Test
    void 후보가_상한에_닿으면_앞에_둔_비공개_값까지만_본다() {
        // 서로 다른 정수 1,000개짜리 입력 하나는 4개씩 이은 조각 997개를 만든다. 셋이면 셋째에서 상한(2,000)에 닿는다.
        List<String> inputs = List.of(1, 2, 3).stream().map(k -> {
            StringBuilder line = new StringBuilder();
            for (int i = 0; i < 1_000; i++) {
                line.append(i * 7 + k * 100_000).append(' ');
            }
            return line.toString();
        }).toList();
        List<String> answerFirst = new ArrayList<>(List.of("SECRET ANSWER-XYZ\n"));
        answerFirst.addAll(inputs);
        List<String> answerLast = new ArrayList<>(inputs);
        answerLast.add("SECRET ANSWER-XYZ\n");

        assertThat(blocked(new FactCheck.Sources(answerFirst, List.of()), "SECRET ANSWER-XYZ를 보세요.")).isTrue();
        assertThat(blocked(new FactCheck.Sources(answerLast, List.of()), "SECRET ANSWER-XYZ를 보세요.")).isFalse();
    }

    @Test
    void 지문의_굵은_글씨나_코드_상수로_나온_값은_비공개_값으로_보지_않는다() {
        assertThat(blocked(new FactCheck.Sources(List.of("IMPOSSIBLE\n"), List.of("불가능하면 **IMPOSSIBLE**을 출력한다.")),
                "IMPOSSIBLE을 출력해야 하는 조건을 떠올려 보세요.")).isFalse();
        assertThat(blocked(new FactCheck.Sources(List.of("6227020800\n"), List.of("answer=6227020800; print(answer+1)")),
                "6227020800에 1을 더하는 부분을 확인하세요.")).isFalse();
        // 공개 글에 없으면 기호가 붙어 있어도 비공개 값이다
        assertThat(blocked(new FactCheck.Sources(List.of("6227020800\n"), List.of("print(answer)")),
                "'6227020800'이 나와야 해요.")).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"1 ≤ N ≤ 10^9", "1 ≤ N ≤ 10⁹", "1 ≤ N ≤ 10<sup>9</sup>", "N ≤ 1e9", "1 ≤ N ≤ 1e9.", "N ≤ 10^{9}",
            "1 ≤ N ≤ 1,000,000,000"})
    void 제약에_지수로_쓴_최대값은_비공개_값으로_보지_않는다(String constraint) {
        FactCheck.Sources sources = new FactCheck.Sources(List.of("1000000000\n"), List.of(constraint));

        assertThat(blocked(sources, "N이 1,000,000,000일 때는 이중 반복이 너무 오래 걸려요.")).isFalse();
        assertThat(blocked(sources, "N이 1000000000일 때를 생각해 보세요.")).isFalse();
    }

    @Test
    void 지수_표기를_그_수로_펼친다() {
        assertThat(FactCheck.powers("1 ≤ N ≤ 2 × 10^5, 답은 10^9 + 7로 나눈 나머지, 값은 2^31 − 1 이하, 1e9, 10⁹, 10<sup>18</sup>"))
                .contains("200000", "1000000000", "1000000007", "2147483648", "2147483647", "1000000000000000000");
        assertThat(FactCheck.powers("n^2번 반복한다, x^9")).isEmpty();
        // 음수 경계도 공개 값이다
        assertThat(blocked(new FactCheck.Sources(List.of("-1000000000\n"), List.of("-10^9 ≤ N ≤ 0")),
                "N이 -1000000000인 경계값을 확인하세요.")).isFalse();
        // 지수가 공개 글에 없으면 최대값도 비공개 값으로 본다
        assertThat(blocked(new FactCheck.Sources(List.of("1000000000\n"), List.of("1 ≤ N ≤ 100")),
                "N이 1000000000일 때를 생각해 보세요.")).isTrue();
    }

    @Test
    void 기호가_낀_비공개_줄의_일부만_옮겨도_잡는다() {
        FactCheck.Sources sources = new FactCheck.Sources(List.of("(3,7) (1,9) (4,4) (8,2) (6,5)\n"), List.of());

        assertThat(blocked(sources, "(3,7) (1,9) (4,4) (8,2)를 넣어 보세요.")).isTrue();
        assertThat(blocked(sources, "(3,7) (1,9) (4,4) (8,2) (6,5)를 넣어 보세요.")).isTrue();
        // 값이 모두 한 글자면 8개 이상 이어져야 본다
        assertThat(blocked(sources, "(3,7) (1,9) (4,4)를 넣어 보세요.")).isFalse();
        assertThat(blocked(sources, "(3,7)을 넣어 보세요.")).isFalse();
    }

    @Test
    void 한_글자_값만_있는_비공개_줄은_지어낸_예시와_겹치기_쉬워_길게_같을_때만_잡는다() {
        FactCheck.Sources sources = new FactCheck.Sources(
                List.of("3 1 4 1 5 9 2 6 5 3 5 8 9 7 9 3\n", "0 1 1 0 1 0 0 1 1 0\n", "5 3 8 1 2\n"), List.of());

        assertThat(blocked(sources, "예를 들어 배열이 [3, 1, 4, 1, 5]이면 어떻게 될까요?")).isFalse();
        assertThat(blocked(sources, "5 3 8 1 2를 넣어 보세요.")).isFalse();
        // 서로 다른 값이 둘뿐이면 길어도 보지 않는다
        assertThat(blocked(sources, "배열이 0 1 1 0 1 0 0 1 1 0이면 어떻게 될까요?")).isFalse();
        assertThat(blocked(sources, "3 1 4 1 5 9 2 6을 넣어 보세요.")).isTrue();
        assertThat(blocked(sources, "배열이 [5, 9, 2, 6, 5, 3, 5, 8, 9]일 때를 보세요.")).isTrue();
    }

    @Test
    void 두_글자_이상인_값이_섞인_조각은_네_개만_같아도_잡는다() {
        FactCheck.Sources sources = new FactCheck.Sources(List.of("3 12 7 15 4 9 21 8\n"), List.of());

        assertThat(blocked(sources, "12 7 15 4를 넣어 보세요.")).isTrue();
    }

    @Test
    void 자료형의_한계처럼_흔한_수는_비공개_값으로_보지_않는다() {
        FactCheck.Sources sources = new FactCheck.Sources(
                List.of("2147483647\n", "-2147483648\n", "1000000007\n", "6227020800\n"), List.of());

        assertThat(blocked(sources, "int의 최댓값 2147483647을 넘으면 오버플로가 납니다.")).isFalse();
        assertThat(blocked(sources, "-2147483648보다 작아질 수 있어요.")).isFalse();
        assertThat(blocked(sources, "1000000007로 나눈 나머지를 구해 보세요.")).isFalse();
        assertThat(blocked(sources, "정답은 6227020800이에요.")).isTrue();
    }

    @Test
    void 괄호로_감싼_정수열이나_기호로만_된_값은_비공개_값으로_보지_않는다() {
        FactCheck.Sources sources = new FactCheck.Sources(
                List.of("[1, 2, 3, 4, 5]\n", "[0, 0, 0, 0, 0]\n", "*********\n ******* \n"), List.of());

        assertThat(blocked(sources, "이미 정렬된 [1, 2, 3, 4, 5]를 넣어 보세요.")).isFalse();
        assertThat(blocked(sources, "[0, 0, 0, 0, 0]을 넣어 보세요.")).isFalse();
        assertThat(blocked(sources, "다섯째 줄은 *********처럼 별이 9개여야 해요.")).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"정답은 -123456789입니다.", "정답은 '-123456789'입니다.", "답이 (-123456789)인지 보세요.",
            "[-123456789]를 출력해야 해요."})
    void 기호가_붙은_음수_비공개_값도_잡는다(String hint) {
        assertThat(blocked(new FactCheck.Sources(List.of("-123456789\n"), List.of()), hint)).isTrue();
    }

    @Test
    void 따옴표나_조사가_붙어_지문에_나온_한글_값은_비공개_값으로_보지_않는다() {
        String hint = "'소수가 아닙니다'를 출력하는 조건을 먼저 확인해 보세요.";
        assertThat(blocked(new FactCheck.Sources(List.of("소수가 아닙니다\n"),
                List.of("소수가 아니면 '소수가 아닙니다'를 출력한다.")), hint)).isFalse();
        assertThat(blocked(new FactCheck.Sources(List.of("소수가 아닙니다\n"), List.of("아니면 소수가 아닙니다를 출력한다.")), hint))
                .isFalse();
        // 지문에 없으면 비공개 값이다
        assertThat(blocked(new FactCheck.Sources(List.of("소수가 아닙니다\n"), List.of("소수인지 판별한다.")), hint)).isTrue();
    }

    @Test
    void 한글이_섞인_비공개_줄도_후보_상한을_지킨다() {
        List<String> hidden = new ArrayList<>();
        for (int c = 0; c < 50; c++) {
            StringBuilder text = new StringBuilder();
            for (int i = 0; text.length() < FactCheckRepository.HIDDEN_TEXT_MAX_CHARS; i++) {
                text.append("학생").append(c * 1_000 + i).append(" 점수 ").append(i * 7).append('\n');
            }
            hidden.add(text.toString());
        }

        FactCheck.Hidden candidates = FactCheck.Context.of(AnalysisSamples.reversePyramid().input(),
                new FactCheck.Sources(hidden, List.of())).hidden();

        assertThat(candidates.phrases()).hasSize(FactCheck.HIDDEN_MAX_PHRASES);
        assertThat(candidates.values().size() + candidates.phrases().size()).isLessThanOrEqualTo(FactCheck.HIDDEN_MAX_CANDIDATES);
    }

    @Test
    void 긴_기호_문자열이_있어도_던지지_않는다() {
        // 제출 코드의 주석 장식이나 아스키 그림. 정규식이 글자마다 재귀하면 StackOverflowError가 난다.
        String code = "#".repeat(60_000) + "\n" + "-".repeat(60_000) + "\n" + "'-".repeat(30_000) + "\nprint(0)\n";

        assertThatCode(() -> verify(analysis(List.of(), List.of("예제 1에서 틀렸습니다."), List.of()),
                AnalysisSamples.reversePyramid(), new FactCheck.Sources(List.of("-123456789\n"), List.of(code))))
                .doesNotThrowAnyException();
        assertThat(blocked(new FactCheck.Sources(List.of("-123456789\n"), List.of(code)), "답이 (-123456789)인지 보세요."))
                .isTrue();
    }

    @Test
    void 긴_숫자열이_있어도_지수_표기를_빨리_찾는다() {
        // 학습자가 정하는 제출 코드도 공개 글로 읽는다. 64KB 상한 안의 긴 숫자열에서 시간이 제곱으로 늘면 안 된다.
        String code = "x = '" + "7".repeat(60_000) + "'\ny = 10^9\nz = '" + "1".repeat(3_000) + "⁹'\n";

        long started = System.nanoTime();
        List<String> powers = FactCheck.powers(code);
        long millis = (System.nanoTime() - started) / 1_000_000;

        assertThat(powers).contains("1000000000");
        assertThat(millis).isLessThan(1_000);
    }

    @Test
    void 쉼표로_이은_목록은_공개_글과_비공개_원문에서도_두_형태로_본다() {
        // 지문에 같은 목록이 있으면 공개 값이다
        assertThat(blocked(new FactCheck.Sources(List.of("100 200 300 400\n"), List.of("예: [100,200,300,400]")),
                "[100,200,300,400]를 넣어 보세요.")).isFalse();
        // 쉼표로 이은 비공개 입력을 공백으로 풀어 써도 잡는다
        assertThat(blocked(new FactCheck.Sources(List.of("100,200,300,400\n"), List.of()), "100 200 300 400을 넣어 보세요."))
                .isTrue();
    }

    @Test
    void 비공개_원문이_커도_후보를_살펴보는_양은_상한까지다() {
        List<String> hidden = new ArrayList<>();
        for (int c = 0; c < 50; c++) {
            StringBuilder text = new StringBuilder();
            for (int i = 0; text.length() < FactCheckRepository.HIDDEN_TEXT_MAX_CHARS; i++) {
                text.append((i * 13 + c * 7) % 1000).append(' ');
            }
            hidden.add(text.toString());
        }
        hidden.add(0, "SECRET ANSWER-XYZ\n");

        assertThat(blocked(new FactCheck.Sources(hidden, List.of("x = 1\n".repeat(10_000))), "SECRET ANSWER-XYZ를 보세요."))
                .isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            // 짧은 값, 1씩 느는 정수열, 같은 값의 되풀이
            "150을 출력해야 합니다.", "1 2 3 4 5 6을 넣어 보세요.", "7 7 7 7 7을 넣어 보세요.",
            // 공개 예제와 같은 값
            "3 다음 줄에 1 2 3을 넣어 보세요.",
            // 값 경계가 다르다
            "110 20 30 40과 10 20 30 400은 다릅니다."})
    void 비공개_값이_아닌_글은_지우지_않는다(String text) {
        AnalysisResult result = analysis(List.of(), List.of("예제 1에서 틀렸습니다."), List.of(text));

        assertThat(verify(result, AnalysisSamples.reversePyramid(), HIDDEN).fixes()).isEmpty();
    }

    @Test
    void 몇_번째_비공개_테스트인지_말한_항목은_지운다() {
        AnalysisResult result = new AnalysisResult("요약", List.of(), List.of("예제 1에서 틀렸습니다."),
                List.of("3번째 비공개 테스트에서 틀린 것 같습니다.", "비공개 테스트 9개 중 7개에서 틀린 것 같습니다."),
                new AnalysisResult.Hints("비공개 테스트 2번을 떠올려 보세요.", "힌트 2", "힌트 3"));

        FactCheck.Outcome<AnalysisResult> outcome = verify(result, AnalysisSamples.reversePyramid());

        assertThat(outcome.result().guesses()).containsExactly("비공개 테스트 9개 중 7개에서 틀린 것 같습니다.");
        assertThat(FactCheck.describe(outcome.fixes()))
                .isEqualTo("HIDDEN_ORDINAL@guesses[0],HIDDEN_ORDINAL@hints.observation(kept)");
    }

    // ===== 기록·빈 입력 =====

    @Test
    void 빈_입력에서도_던지지_않는다() {
        AnalysisInput empty = new AnalysisInput(
                AnalysisInput.Problem.of("제목", null, null, null, null, 1000, 128, List.of()),
                AnalysisInput.Submission.of(Language.PYTHON, Verdict.WRONG_ANSWER, null, null, null, "", null), null, null);
        AnalysisResult result = new AnalysisResult("요약", List.of(1), List.of("예제 1에서 틀렸습니다.", "비공개 테스트 3개"),
                List.of("1번째 줄"), HINTS);

        assertThatCode(() -> FactCheck.verify(result, FactCheck.Context.of(empty, FactCheck.Sources.NONE)))
                .doesNotThrowAnyException();
        assertThatCode(() -> FactCheck.verify(result, FactCheck.Context.of(empty,
                new FactCheck.Sources(Arrays.asList("1 2 9 9 9 9", null), Arrays.asList(null, "x")))))
                .doesNotThrowAnyException();
    }

    @Test
    void 기록에는_응답_글과_비공개_값을_남기지_않는다() {
        AnalysisResult result = analysis(List.of(9), List.of("비공개 입력 10 20 30 40 50에서 틀렸습니다."), List.of());
        FactCheck.Context context = FactCheck.Context.of(AnalysisSamples.reversePyramid().input(), HIDDEN);

        FactCheck.Outcome<AnalysisResult> outcome = FactCheck.verify(result, context);

        String recorded = FactCheck.describe(outcome.fixes()) + outcome.meta() + context + HIDDEN;
        assertThat(recorded).doesNotContain("10 20", "틀렸", "안녕", "합");
    }

    // ===== F3 =====

    @Test
    void 코드_리뷰는_범위_밖_줄을_짚은_개선점만_지우고_나머지는_센다() {
        CodeReviewResult result = new CodeReviewResult("요약입니다.",
                new CodeReviewResult.Complexity("9번 줄의 반복이 n번 돕니다.", "O(n)", "O(1)", "O(1)", "비교", false),
                List.of("12번 줄의 변수 이름을 바꾸면 좋아요.", "3~5번 줄을 함수로 묶으면 좋아요."),
                List.of(new CodeReviewResult.Concept("등차수열의 합", "반복 없이 구할 수 있어요.")));

        FactCheck.Outcome<CodeReviewResult> outcome = FactCheck.verify(result, 5);

        assertThat(outcome.result().improvements()).containsExactly("3~5번 줄을 함수로 묶으면 좋아요.");
        assertThat(outcome.result().complexity()).isEqualTo(result.complexity());
        assertThat(FactCheck.describe(outcome.fixes()))
                .isEqualTo("LINE_OUT_OF_RANGE@complexity.basis(kept),LINE_OUT_OF_RANGE@improvements[0]");
        assertThat(outcome.meta()).isEqualTo(new FactCheck.Meta(FactCheck.VERSION, 1, 0, 1,
                List.of("LINE_OUT_OF_RANGE@complexity.basis(kept)", "LINE_OUT_OF_RANGE@improvements[0]")));
    }

    // ===== 도우미 =====

    private static AnalysisResult analysis(List<Integer> lines, List<String> facts, List<String> guesses) {
        return new AnalysisResult("요약", lines, facts, guesses, HINTS);
    }

    private static FactCheck.Outcome<AnalysisResult> verify(AnalysisResult result, AnalysisSamples.Case sample) {
        return verify(result, sample, FactCheck.Sources.NONE);
    }

    private static FactCheck.Outcome<AnalysisResult> verify(AnalysisResult result, AnalysisSamples.Case sample,
            FactCheck.Sources sources) {
        return FactCheck.verify(result, FactCheck.Context.of(sample.input(), sources));
    }

    // 사실 하나를 검사해 걸린 사유를 돌려준다.
    private static List<Kind> kinds(AnalysisSamples.Case sample, String fact) {
        return verify(analysis(List.of(), List.of(fact), List.of()), sample).fixes().stream().map(Fix::kind).toList();
    }

    private static List<String> fixes(AnalysisSamples.Case sample, String... facts) {
        return verify(analysis(List.of(), List.of(facts), List.of()), sample).fixes().stream()
                .map(fix -> fix.kind() + "@" + fix.field()).toList();
    }

    // 2단계 힌트에 text를 넣었을 때 차단되는가
    private static boolean blocked(FactCheck.Sources sources, String text) {
        AnalysisResult result = new AnalysisResult("요약", List.of(), List.of("예제 1에서 틀렸습니다."), List.of(),
                new AnalysisResult.Hints("힌트 1", text, "힌트 3"));
        return verify(result, AnalysisSamples.reversePyramid(), sources).blocked();
    }

    private static List<String> refs(String text) {
        return FactCheck.lineRefs(AnswerGuard.normalize(text)).stream().map(r -> r[0] + "-" + r[1]).toList();
    }
}
