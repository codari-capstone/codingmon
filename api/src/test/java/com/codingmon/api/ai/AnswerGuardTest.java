package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.codingmon.api.ai.AnswerGuard.Rule;
import com.codingmon.api.ai.AnswerGuard.Violation;

// 정답 코드 금지 검사(#78)의 규칙. 정상 응답은 실제 모델(gemma4:12b)이 프롬프트 v1으로 낸 응답에서 옮겼다.
class AnswerGuardTest {

    private static final String PYRAMID_CODE = """
            n = int(input())

            # 피라미드 출력
            for i in range(1, n + 1):
                print(' ' * (n - i) + '*' * (2 * i - 1))
            """;
    private static final String PYRAMID_REFERENCE = """
            n = int(input())
            for i in range(1, n + 1):
                print(' ' * (i - 1) + '*' * (2 * (n - i) + 1))
            """;
    private static final String FIBONACCI_CODE = """
            n = int(input())
            dp = [0] * (n + 1)
            dp[1] = 1
            for i in range(2, n + 1):
                dp[i] = dp[i - 1] * dp[i - 2]
            print(dp[n] % 1000000007)
            """;
    private static final String FIBONACCI_REFERENCE = """
            n = int(input())
            dp = [0] * (n + 2)
            dp[1] = 1
            for i in range(2, n + 1):
                dp[i] = (dp[i - 1] + dp[i - 2]) % 1000000007  # 점화식
            print(dp[n])
            """;

    @Test
    void 실제_모델의_정상_응답은_통과한다() {
        AnalysisResult result = result(
                "별의 개수가 줄어드는 것이 아니라 늘어나도록 계산되었습니다.",
                List.of("예제 1번에서 기대 출력은 첫 줄 별 5개, 두 번째 줄 별 3개, 세 번째 줄 별 1개이지만, 실제 출력은 첫 줄 별 1개,"
                        + " 두 번째 줄 별 3개, 세 번째 줄 별 5개로 출력되었습니다."),
                List.of("4번 줄에서 i가 1부터 n까지 증가하도록 설정되어 있어 별의 개수가 줄어들지 않는 것 같습니다.",
                        "4번 줄의 range(1, n + 1) 때문에 첫 줄의 별이 가장 적은 것 같습니다."),
                "예제 1번의 실제 출력과 기대 출력을 비교하여 별의 개수가 줄어드는 규칙이 지켜지고 있는지 확인해 보세요.",
                "반복문에서 i가 줄어드는 방향으로 변하게 하거나, 5번 줄의 공백과 별의 개수를 계산하는 수식을 수정해야 합니다.",
                // 정답 코드와 같은 식이지만 3단계 원리는 식을 보여 준다.
                "i번째 줄(i는 1부터 n까지)에서 별의 개수는 2 * (n - i) + 1개이고, 공백의 개수는 i − 1개입니다."
                        + " 예를 들어 n이 3일 때, 첫 번째 줄(i=1)은 공백 0개, 별 5개입니다.");

        assertThat(withReference(result, PYRAMID_CODE, List.of("반복문 범위", "인덱스 변환"), PYRAMID_REFERENCE))
                .isEmpty();
    }

    @Test
    void 코드_블록과_들여_쓴_코드_줄을_찾는다() {
        assertThat(rules(check(withPrinciple("다음처럼 고치세요.\n```\n별을 찍는다\n```"))))
                .containsExactly(Rule.CODE_BLOCK);
        assertThat(rules(check(withPrinciple("다음처럼 고칩니다.\n    n = n - 1\n그러면 됩니다."))))
                .containsExactly(Rule.INDENTED_CODE);
        // 들여 쓴 설명 글은 코드가 아니다.
        assertThat(check(withPrinciple("두 가지를 보세요.\n    첫째, 줄 수를 세어 보세요."))).isEmpty();
    }

    @Test
    void 코드에_그대로_옮길_수_있는_글을_찾는다() {
        for (String text : List.of(
                "4번 줄을 for i in range(n, 0, -1): 로 바꾸면 됩니다.",
                "반복 범위를 range(n)으로 바꾸세요.",
                "합계를 long long sum으로 선언하세요.",
                "int sum = 0; 으로 시작해 보세요.",
                "cout << a + b 처럼 출력합니다.",
                "if n == 1: 일 때만 따로 처리합니다.",
                "a.append(x)로 넣으면 됩니다.",
                "반복할 때마다 i += 1을 해 주세요.",
                "for (int i = 0; i < n; i++) 처럼 돌리세요.")) {
            assertThat(rules(check(withPrinciple(text)))).as(text).containsExactly(Rule.CODE_PATTERN);
        }
    }

    @Test
    void 학습자_코드를_그대로_짚은_글과_설명_글은_코드로_보지_않는다() {
        for (String text : List.of(
                "4번 줄의 for i in range(1, n + 1): 부분에서 i가 1부터 커집니다.",
                "5번 줄의 print(' ' * (n - i) + '*' * (2 * i - 1))에서 별 개수 식을 보세요.",
                "C++에서는 모든 명령문 끝에 세미콜론(;)을 찍어야 합니다. 6번 줄 끝에 (;)이 없습니다.",
                "print 함수는 출력 끝에 줄바꿈을 붙입니다.",
                "전체 합은 최대 10^14이고, 32비트 정수형은 약 2*10^9까지 담습니다.",
                "판정: 틀렸습니다. 1부터 n까지의 합은 n × (n + 1) / 2입니다.")) {
            assertThat(check(withPrinciple(text))).as(text).isEmpty();
        }
    }

    @Test
    void 정답_코드와_같은_코드_조각을_찾는다() {
        AnalysisResult copied = withPrinciple("i번째 값은 dp[i] = (dp[i − 1] + dp[i − 2]) % 1000000007 로 구합니다.");

        assertThat(rules(withReference(copied, FIBONACCI_CODE, List.of("반복문 범위"), FIBONACCI_REFERENCE)))
                .containsExactly(Rule.REFERENCE_SIMILAR);
        // 정답 코드가 없으면 비교하지 않는다.
        assertThat(withReference(copied, FIBONACCI_CODE, List.of("반복문 범위"))).isEmpty();
    }

    @Test
    void 정답_코드와_같아도_학습자_코드에_있는_조각이나_식은_위반이_아니다() {
        // 학습자 코드와 정답 코드가 같은 줄(4번 줄)을 짚었다.
        AnalysisResult quoted = withGuess("4번 줄 for i in range(2, n + 1): 의 반복 범위는 맞는 것 같습니다.");
        // 정답 코드에 있는 식이지만 코드에만 쓰는 기호가 없다.
        AnalysisResult formula = withPrinciple("별의 개수는 2 * (n - i) + 1개입니다.");

        assertThat(withReference(quoted, FIBONACCI_CODE, List.of("반복문 범위"), FIBONACCI_REFERENCE)).isEmpty();
        assertThat(withReference(formula, PYRAMID_CODE, List.of("반복문 범위"), PYRAMID_REFERENCE)).isEmpty();
    }

    @Test
    void 개념_태그의_알고리즘_이름을_찾는다() {
        List<String> tags = List.of("동적 계획법", "반복문 범위");

        assertThat(withReference(withPrinciple("동적계획법으로 앞의 두 값을 저장해 두세요."), FIBONACCI_CODE, tags))
                .containsExactly(new Violation(Rule.ALGORITHM_NAME, "hints.principle", "동적 계획법"));
        assertThat(withReference(withSummary("DP 배열의 점화식이 틀린 것 같아요."), FIBONACCI_CODE, tags))
                .containsExactly(new Violation(Rule.ALGORITHM_NAME, "summary", "동적 계획법"));
        // 학습자 코드의 변수 dp를 짚은 것과 일반 개념 태그는 이름을 알려 준 것이 아니다.
        assertThat(withReference(withGuess("5번 줄에서 dp에 곱을 저장하고 있어요. 반복문 범위는 맞아요."), FIBONACCI_CODE,
                tags)).isEmpty();
        // 판정 이름에 들어 있는 태그
        assertThat(withReference(withSummary("출력 형식이 잘못되었습니다."), "", List.of("출력 형식"))).isEmpty();
    }

    @Test
    void 지문에_나온_이름과_스택_오버플로는_알고리즘_이름으로_보지_않는다() {
        AnalysisResult sorted = withGuess("정렬된 순서로 출력하지 않은 것 같아요.");
        AnalysisResult overflow = withSummary("재귀가 너무 깊어 스택 오버플로가 났어요. 스택 영역이 넘쳤습니다.");
        AnalysisResult stack = withPrinciple("스택에 여는 괄호를 쌓아 두면 됩니다.");

        assertThat(withProblem(sorted, List.of("정렬"), "수를 오름차순으로 정렬해 출력하세요.")).isEmpty();
        assertThat(rules(withProblem(sorted, List.of("정렬"), "수를 출력하세요."))).containsExactly(Rule.ALGORITHM_NAME);
        assertThat(withProblem(overflow, List.of("스택"), "괄호 짝 맞추기")).isEmpty();
        assertThat(rules(withProblem(stack, List.of("스택"), "괄호 짝 맞추기"))).containsExactly(Rule.ALGORITHM_NAME);
    }

    @Test
    void 로그에는_규칙과_위치만_남긴다() {
        List<Violation> violations = withReference(withPrinciple("동적계획법으로 range(n)까지 도세요."), "",
                List.of("동적 계획법"));

        assertThat(AnswerGuard.describe(violations))
                .isEqualTo("CODE_PATTERN@hints.principle,ALGORITHM_NAME@hints.principle(동적 계획법)");
    }

    private static List<Violation> check(AnalysisResult result) {
        return withReference(result, PYRAMID_CODE, List.of("반복문 범위"));
    }

    private static List<Violation> withReference(AnalysisResult result, String code, List<String> tags,
            String... references) {
        return AnswerGuard.check(result, new AnswerGuard.Context(code, "문제", tags, List.of(references)));
    }

    private static List<Violation> withProblem(AnalysisResult result, List<String> tags, String problem) {
        return AnswerGuard.check(result, new AnswerGuard.Context("", problem, tags, List.of()));
    }

    private static List<Rule> rules(List<Violation> violations) {
        return violations.stream().map(Violation::rule).distinct().toList();
    }

    private static AnalysisResult withSummary(String summary) {
        return result(summary, List.of("예제 1에서 틀렸습니다."), List.of(), "예제를 보세요.", "식을 보세요.", "규칙입니다.");
    }

    private static AnalysisResult withGuess(String guess) {
        return result("요약입니다.", List.of("예제 1에서 틀렸습니다."), List.of(guess), "예제를 보세요.", "식을 보세요.", "규칙입니다.");
    }

    private static AnalysisResult withPrinciple(String principle) {
        return result("요약입니다.", List.of("예제 1에서 틀렸습니다."), List.of(), "예제를 보세요.", "식을 보세요.", principle);
    }

    private static AnalysisResult result(String summary, List<String> facts, List<String> guesses, String observation,
            String direction, String principle) {
        return new AnalysisResult(summary, List.of(), facts, guesses,
                new AnalysisResult.Hints(observation, direction, principle));
    }
}
