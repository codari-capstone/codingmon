package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.codingmon.api.ai.AnswerGuard.Rule;
import com.codingmon.api.ai.AnswerGuard.Violation;

// 코드 리뷰(F3) 응답에 쓰는 정답 코드 금지 검사(#82). 규칙 자체는 AnswerGuardTest(#78)가 본다.
// 리뷰에는 알고리즘 이름 규칙을 쓰지 않고, 나머지 규칙(코드 블록, 들여 쓴 코드, 코드 모양, 정답 코드 조각)은 그대로 쓴다.
// 정상 응답은 실제 모델(gemma4:12b)이 code-review-v1으로 낸 응답(CodeReviewSamples.countAtMost)에서 옮겼다.
class CodeReviewGuardTest {

    private static final String COUNT_CODE = """
            n, q = map(int, input().split())
            a = list(map(int, input().split()))
            for _ in range(q):
                x = int(input())
                count = 0
                for v in a:
                    if v <= x:
                        count += 1
                print(count)
            """;
    // 다른 정답 코드(정렬 뒤 이분 탐색). 모델에도 사용자에게도 보내지 않는다.
    private static final String COUNT_REFERENCE = """
            import bisect
            n, q = map(int, input().split())
            a = sorted(map(int, input().split()))
            for _ in range(q):
                print(bisect.bisect_right(a, int(input())))
            """;
    private static final List<String> TAGS = List.of("정렬", "이분 탐색");

    @Test
    void 실제_모델의_정상_응답은_통과한다() {
        CodeReviewResult result = review(
                "리스트를 매번 순회하며 조건에 맞는 숫자를 세는 완전 탐색 방식으로 문제를 해결했습니다. 구현이 간단하고 명확하며,"
                        + " 주어진 제한 범위 내에서 정답을 도출해낸 점이 훌륭합니다.",
                List.of("정렬과 이분 탐색 활용: 2번 줄에서 입력받은 리스트 a를 미리 정렬합니다. 그 후 3~9번 줄의 질의 처리 부분에서"
                        + " 리스트 전체를 순회하는 루프 대신 이분 탐색을 사용하여 x 이하인 수의 마지막 위치를 찾습니다."),
                new CodeReviewResult.Concept("정렬", "데이터를 크기 순으로 나열하면 특정 값보다 작은 요소들의 개수를 범위의 위치로 치환하여"
                        + " 빠르게 파악할 수 있습니다."),
                new CodeReviewResult.Concept("이분 탐색", "정렬된 배열에서 특정 기준값에 해당하는 위치를 로그 시간 복잡도로 찾아내어"
                        + " 질의 처리 속도를 최적화합니다."));

        assertThat(check(result)).isEmpty();
    }

    @Test
    void 문제_태그의_알고리즘_이름은_리뷰에서_막지_않는다() {
        // 같은 글을 오답 분석에 쓰면 알고리즘 이름 규칙에 걸린다. 리뷰는 다음에 배울 개념의 이름을 알려 주는 것이 목적이다.
        String text = "리스트를 정렬한 뒤 이분 탐색으로 위치를 찾으면 질의마다 전체를 훑지 않아도 됩니다.";
        AnswerGuard.Context context = context(List.of());

        assertThat(AnswerGuard.check(review(text, List.of(), concept("이분 탐색")), context)).isEmpty();
        assertThat(AnswerGuard.check(new AnalysisResult(text, List.of(), List.of("예제 1에서 틀렸습니다."), List.of(),
                new AnalysisResult.Hints("예제를 보세요.", "식을 보세요.", "규칙입니다.")), context))
                .extracting(Violation::rule).contains(Rule.ALGORITHM_NAME);
        assertThat(AnswerGuard.CODE_REVIEW_RULES).doesNotContain(Rule.ALGORITHM_NAME)
                .contains(Rule.CODE_BLOCK, Rule.INDENTED_CODE, Rule.CODE_PATTERN, Rule.REFERENCE_SIMILAR);
    }

    @Test
    void 고친_코드를_쓰면_막는다() {
        for (String improvement : List.of(
                "2번 줄 뒤에 a.sort()를 넣으세요.",
                "4번 줄을 x = int(sys.stdin.readline())로 바꾸면 빠릅니다.",
                "6~8번 줄 대신 bisect_right(a, x)를 출력하세요.")) {
            assertThat(rules(check(review("요약입니다.", List.of(improvement)))))
                    .as(improvement).contains(Rule.CODE_PATTERN);
        }
        // 이름만 말하고 바꾸는 방법을 말로 설명하면 통과한다(지시의 "괄호 없이 이름만").
        assertThat(check(review("요약입니다.", List.of("2번 줄 뒤에서 sort 메서드로 리스트를 한 번 정렬해 두면,"
                + " 질의마다 처음부터 훑지 않고 위치만 찾으면 됩니다.")))).isEmpty();
    }

    @Test
    void 학습자_코드를_짚은_글은_통과하지만_코드_블록이나_들여_쓴_줄로_옮기면_막는다() {
        // 학습자 코드는 이미 정답이고 본인 코드라 그대로 짚어도 새로 알려 주는 것이 없다.
        assertThat(check(review("요약입니다.", List.of("6번 줄의 for v in a: 반복이 질의마다 N번 돕니다.")))).isEmpty();
        assertThat(rules(check(review("요약입니다.", List.of("지금 코드는 다음과 같습니다.\n```\nfor v in a:\n```")))))
                .containsExactly(Rule.CODE_BLOCK);
        assertThat(rules(check(review("요약입니다.", List.of("지금 코드는 다음과 같습니다.\n    count += 1\n그래서 느립니다.")))))
                .contains(Rule.INDENTED_CODE);
    }

    @Test
    void 정답_코드의_조각을_옮기면_막는다() {
        List<Violation> violations = check(review("요약입니다.",
                List.of("for _ in range(q): print(bisect.bisect_right(a, int(input()))) 처럼 쓰면 됩니다.")));

        assertThat(rules(violations)).contains(Rule.REFERENCE_SIMILAR);
    }

    @Test
    void 복잡도_표기는_코드_모양으로_보지_않는다() {
        CodeReviewResult result = new CodeReviewResult("요약입니다.",
                new CodeReviewResult.Complexity("6번 줄의 반복이 질의마다 N번 돕니다.", "O(max(N, Q) × N)", "O(N)",
                        "O(sqrt(N) + Q log N)", "의도한 O((N + Q) log N)보다 느린 것으로 추정됩니다.", false),
                List.of("약수는 sqrt(n)까지만 확인하면 되고, 최소공배수는 a × b / gcd(a, b)로 구합니다."), List.of(concept("정렬")));

        assertThat(check(result)).isEmpty();
        // 표기 밖에서 학습자 코드에 없는 호출을 쓰면 그대로 걸린다.
        assertThat(rules(check(review("요약입니다.", List.of("마지막에 max(count, 0)을 출력하세요."))))).contains(Rule.CODE_PATTERN);
    }

    @Test
    void 모든_글을_검사하고_위치를_남긴다() {
        CodeReviewResult result = new CodeReviewResult("요약입니다.",
                new CodeReviewResult.Complexity("근거입니다.", "O(n)", "O(1)", "O(1)", "a.sort()를 먼저 하면 됩니다.", false),
                List.of("첫 개선점입니다.", "range(q)를 range(n)으로 바꾸세요."),
                List.of(new CodeReviewResult.Concept("정렬", "sorted(a)로 정렬합니다.")));

        assertThat(AnswerGuard.describe(check(result)))
                .isEqualTo("CODE_PATTERN@complexity.comparison,CODE_PATTERN@improvements[1],"
                        + "CODE_PATTERN@nextConcepts[0].reason");
    }

    private static List<Violation> check(CodeReviewResult result) {
        return AnswerGuard.check(result, context(List.of(new AnswerGuard.Reference("PYTHON", COUNT_REFERENCE))));
    }

    private static AnswerGuard.Context context(List<AnswerGuard.Reference> references) {
        return new AnswerGuard.Context(COUNT_CODE, "PYTHON", "x 이하인 수 세기", TAGS, references);
    }

    private static List<Rule> rules(List<Violation> violations) {
        return violations.stream().map(Violation::rule).distinct().toList();
    }

    private static CodeReviewResult review(String summary, List<String> improvements, CodeReviewResult.Concept... concepts) {
        return new CodeReviewResult(summary,
                new CodeReviewResult.Complexity("6번 줄의 반복이 질의마다 N번 돕니다.", "O(Q × N)", "O(N)", "O((N + Q) log N)",
                        "N, Q ≤ 2,000에서 약 400만 번이라 시간 안에 들어오지만, 의도한 복잡도보다 느린 것으로 추정됩니다.", false),
                improvements, concepts.length == 0 ? List.of(concept("정렬")) : List.of(concepts));
    }

    private static CodeReviewResult.Concept concept(String name) {
        return new CodeReviewResult.Concept(name, name + "을 배우면 이 코드를 더 빠르게 만들 수 있어요.");
    }
}
