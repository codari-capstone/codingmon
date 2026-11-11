package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeout;

import java.time.Duration;
import java.util.List;
import java.util.stream.Stream;

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
        // n = n - 1은 코드 모양 검사에도 걸린다.
        assertThat(rules(check(withPrinciple("다음처럼 고칩니다.\n    n = n - 1\n그러면 됩니다."))))
                .containsExactly(Rule.INDENTED_CODE, Rule.CODE_PATTERN);
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

        // 학습자 코드의 dp에 다른 값을 넣는 글이라 코드 모양 검사에도 걸린다.
        assertThat(rules(withReference(copied, FIBONACCI_CODE, List.of("반복문 범위"), FIBONACCI_REFERENCE)))
                .containsExactly(Rule.CODE_PATTERN, Rule.REFERENCE_SIMILAR);
        // 정답 코드가 없으면 비교하지 않는다.
        assertThat(rules(withReference(copied, FIBONACCI_CODE, List.of("반복문 범위"))))
                .containsExactly(Rule.CODE_PATTERN);
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
    void 입출력_문장은_끝까지_맞춰_고친_문장을_찾는다() {
        String code = """
                #include <iostream>
                using namespace std;

                int main() {
                    int a, b;
                    cin >> a >> b
                    cout << a + b << endl;
                    return 0;
                }
                """;

        // AnalysisSamples.missingSemicolon()이 금지한 글
        assertThat(rules(withReference(withPrinciple("6번 줄을 cin >> a >> b; 로 바꾸세요."), code, List.of("입출력"))))
                .containsExactly(Rule.CODE_PATTERN);
        assertThat(withReference(withGuess("6번 줄의 cin >> a >> b 뒤에 문장 끝 표시가 없는 것 같아요."), code, List.of("입출력")))
                .isEmpty();
        assertThat(withReference(withGuess("6번 줄 `cin >> a >> b`에서 끝나는 표시가 빠졌어요."), code, List.of("입출력")))
                .isEmpty();
    }

    @Test
    void 파이썬_내장_함수와_집합_메서드_호출을_찾는다() {
        // AnalysisSamples.indexOutOfRange()와 quadraticPairs()가 금지한 글
        for (String text : List.of("sum(a)로 한 번에 더하면 됩니다.", "set()을 하나 만들어 두세요.", "seen.add(x)로 본 수를 넣으세요.",
                "max(a, b)를 출력하세요.")) {
            assertThat(rules(check(withPrinciple(text)))).as(text).containsExactly(Rule.CODE_PATTERN);
        }
    }

    @Test
    void 따옴표_안의_공백만_다른_코드는_학습자_코드의_인용이_아니다() {
        String code = """
                words = input().split()
                print(''.join(words))
                """;

        assertThat(rules(withReference(withPrinciple("2번 줄을 print(' '.join(words))로 바꾸세요."), code, List.of("문자열"))))
                .containsExactly(Rule.CODE_PATTERN);
        assertThat(withReference(withGuess("2번 줄의 print(''.join(words))에서 단어 사이에 아무것도 넣지 않아요."), code,
                List.of("문자열"))).isEmpty();
        assertThat(AnswerGuard.compact("print( ' a b ' ) # don't\nx = 1")).isEqualTo("print(' a b ')#don't x=1");
    }

    @Test
    void 정답_코드의_주석은_언어에_맞게_지운다() {
        String reference = """
                n = int(input())
                a = sorted(map(int, input().split()))
                median = (a[n // 2] + a[n // 2 - 1]) / 2  # 짝수 개
                print('#' * n, median)
                """;
        AnalysisResult copied = withPrinciple("가운데 값은 median = (a[n // 2] + a[n // 2 - 1]) / 2 로 구합니다.");

        // 파이썬의 //는 몫이라 지우지 않는다.
        assertThat(rules(withReference(copied, "median = a[0]", List.of("정렬"), reference)))
                .contains(Rule.REFERENCE_SIMILAR);
        assertThat(AnswerGuard.stripComments(reference, "PYTHON"))
                .contains("a[n // 2 - 1]) / 2  \n").contains("print('#' * n, median)").doesNotContain("짝수");
        assertThat(AnswerGuard.stripComments("#include <cstdio>\nint a = 1; // 하나\nint b = 2; /* 둘 */\nputs(\"//\");",
                "CPP")).isEqualTo("#include <cstdio>\nint a = 1; \nint b = 2;  \nputs(\"//\");");
    }

    @Test
    void 들여_쓴_설명_줄의_등호는_코드가_아니고_한글_주석을_단_코드는_코드다() {
        assertThat(check(withPrinciple("예를 들어\n    n = 3일 때 별은 5개입니다."))).isEmpty();
        assertThat(rules(check(withPrinciple("다음처럼 고칩니다.\n    n = n - 1  # 한 줄 줄이기"))))
                .containsExactly(Rule.INDENTED_CODE, Rule.CODE_PATTERN);
    }

    @Test
    void 초기값이나_호출_대상만_바꾼_문장은_학습자_코드의_인용이_아니다() {
        String code = """
                #include <iostream>
                int main() {
                    int sum = 1;
                    a.append(x);
                }
                """;

        for (String text : List.of("int sum = 0; 으로 고치세요.", "b.append(x)로 넣으세요.")) {
            assertThat(rules(withReference(withPrinciple(text), code, List.of("입출력")))).as(text)
                    .containsExactly(Rule.CODE_PATTERN);
        }
        for (String text : List.of("3번 줄의 int sum = 1; 에서 처음 값을 보세요.", "4번 줄 a.append(x)에서 넣는 곳을 보세요.",
                "4번 줄(a.append(x))에서 넣는 곳을 보세요.", "3번 줄 int sum = 1, 4번 줄 a.append(x)를 보세요.")) {
            assertThat(withReference(withGuess(text), code, List.of("입출력"))).as(text).isEmpty();
        }
    }

    @Test
    void 좌변을_우변에_다시_쓰는_대입을_찾는다() {
        // AnalysisSamples.endlessLoop()가 금지한 글
        assertThat(rules(check(withPrinciple("반복문 안에 i = i + 1을 넣으세요.")))).containsExactly(Rule.CODE_PATTERN);
        // 수식 설명은 대입이 아니다.
        assertThat(check(withPrinciple("합은 S = n * (n + 1) / 2이고, n = 3일 때 6입니다."))).isEmpty();
    }

    @Test
    void 괄호_안이_한글_설명이면_호출이_아니다() {
        assertThat(check(withPrinciple("합을 int(32비트 정수)로 담으면 넘칩니다. len(리스트 길이)도 보세요."))).isEmpty();
        assertThat(rules(check(withPrinciple("print('별')로 찍으세요.")))).containsExactly(Rule.CODE_PATTERN);
    }

    @Test
    void 태그가_다른_이름으로_붙어도_같은_묶음의_이름을_찾는다() {
        // AnalysisSamples.quadraticPairs()의 태그는 "해시"다.
        assertThat(withProblem(withPrinciple("딕셔너리에 본 수를 넣어 두세요."), List.of("해시"), "합이 K인 쌍"))
                .containsExactly(new Violation(Rule.ALGORITHM_NAME, "hints.principle", "해시"));
        assertThat(withProblem(withPrinciple("이분 탐색으로 찾으세요."), List.of("이진 탐색"), "수 찾기"))
                .containsExactly(new Violation(Rule.ALGORITHM_NAME, "hints.principle", "이진 탐색"));
    }

    @Test
    void 긴_문자열_리터럴도_토큰으로_나눈다() {
        String code = "table = '" + "0123456789".repeat(2_000) + "'\nprint(table[0])\n";

        assertThat(AnswerGuard.tokens(code)).hasSize(10);
        assertThat(check(withPrinciple("요약입니다."))).isEmpty();
        assertThat(withReference(withPrinciple("2번 줄의 print(table[0])를 보세요."), code, List.of("문자열"), code)).isEmpty();
    }

    @Test
    void 수를_세는_말이_붙은_낱말은_인용_문장에_넣지_않는다() {
        // 학습자 코드 4번 줄 그대로다. "n번"의 n은 설명 글이다.
        assertThat(check(withGuess("4번 줄 for i in range(1, n + 1): n번 반복합니다."))).isEmpty();
        // 조사가 붙은 낱말은 고친 코드의 일부다.
        String code = """
                #include <iostream>
                int main() {
                    int sum = 1;
                }
                """;
        assertThat(rules(withReference(withPrinciple("int sum = 0으로 시작하세요."), code, List.of("입출력"))))
                .containsExactly(Rule.CODE_PATTERN);
    }

    @Test
    void 인용은_식별자_경계와_괄호_깊이를_지켜_비교한다() {
        String code = """
                #include <cstdint>
                int main() {
                    uint64_t sum = 0;
                    int a[10];
                }
                """;

        for (String text : List.of("int64_t sum = 0; 으로 바꾸세요.", "int a[10] = {0}; 으로 바꾸세요.")) {
            assertThat(rules(withReference(withPrinciple(text), code, List.of("입출력")))).as(text)
                    .containsExactly(Rule.CODE_PATTERN);
        }
        assertThat(withReference(withGuess("3번 줄 uint64_t sum = 0; 은 맞아요. 4번 줄 int a[10]; 도 맞아요."), code,
                List.of("입출력"))).isEmpty();
        assertThat(AnswerGuard.quoted("uint64_t sum=0;", "int64_t sum=0;")).isFalse();
        assertThat(AnswerGuard.quoted("a=1;uint64_t sum=0;", "uint64_t sum=0;")).isTrue();
    }

    @Test
    void 문자열_리터럴_안의_기호는_바꾸지_않는다() {
        assertThat(AnswerGuard.normalize("print('×') # a × b")).isEqualTo("print('×') # a * b");
        assertThat(AnswerGuard.normalize("print('Ａ') # Ａ")).isEqualTo("print('Ａ') # A");
        assertThat(rules(withReference(withPrinciple("print('A')로 바꾸세요."), "print('Ａ')\n", List.of("문자열"))))
                .containsExactly(Rule.CODE_PATTERN);
        assertThat(rules(withReference(withPrinciple("print('*')로 바꾸세요."), "print('×')\n", List.of("문자열"))))
                .containsExactly(Rule.CODE_PATTERN);
    }

    @Test
    void 반복문_꼴과_lambda를_말로_설명한_글은_코드가_아니다() {
        assertThat(check(withPrinciple("C++의 반복문은 for (초기식; 조건식; 증감식) 꼴입니다."))).isEmpty();
        assertThat(check(withPrinciple("lambda 함수: 이름 없는 한 줄 함수입니다."))).isEmpty();
    }

    @Test
    void 학습자_코드_주석의_알고리즘_이름으로는_검사를_끄지_못한다() {
        AnalysisResult result = withPrinciple("그리디로 큰 수부터 고르세요.");
        String commented = "# 그리디 DP BFS\nn = int(input())\n";
        String named = "greedy = True\n";

        assertThat(rules(withReference(result, commented, List.of("그리디")))).containsExactly(Rule.ALGORITHM_NAME);
        // 코드에 이름이 그대로 쓰인 경우(변수 이름)는 지금처럼 뺀다.
        assertThat(withReference(withPrinciple("greedy 값을 보세요."), named, List.of("그리디"))).isEmpty();
    }

    @Test
    void 검사_자료의_toString에는_코드를_넣지_않는다() {
        AnswerGuard.Context context = new AnswerGuard.Context("print(1)", "PYTHON", "문제", List.of("정렬"),
                List.of(new AnswerGuard.Reference("PYTHON", "print(sorted(a))")));

        assertThat(context.toString()).doesNotContain("print").contains("8 chars", "16 chars");
    }

    @Test
    void 여러_겹_중첩된_호출도_통째로_비교한다() {
        String code = """
                n = int(input())
                print(n + 1)
                """;

        for (String text : List.of("2번 줄을 print(int(input()))로 바꾸세요.",
                "print(sum(map(int, input().split())))로 한 번에 구하세요.")) {
            assertThat(rules(withReference(withPrinciple(text), code, List.of("입출력")))).as(text)
                    .containsExactly(Rule.CODE_PATTERN);
        }
        assertThat(withReference(withGuess("1번 줄 n = int(input())은 맞아요. 2번 줄 print(n + 1)을 보세요."), code,
                List.of("입출력"))).isEmpty();
    }

    @Test
    void 한_낱말_타입_선언_뒤에_한글이_와도_찾는다() {
        String code = """
                #include <iostream>
                int main() {
                    int sum = 0;
                }
                """;

        // AnalysisSamples.intOverflow()가 금지한 글
        assertThat(rules(withReference(withPrinciple("합계를 int64_t sum으로 선언하세요."), code, List.of("입출력"))))
                .containsExactly(Rule.CODE_PATTERN);
        assertThat(withReference(withGuess("3번 줄의 int sum은 32비트라 넘칠 것 같아요."), code, List.of("입출력"))).isEmpty();
    }

    @Test
    void 들여_쓴_한글_목록의_숫자_괄호는_호출이_아니다() {
        assertThat(check(withPrinciple("규칙을 보세요.\n    1. 예제 1(입력 3)은 별 5개입니다."))).isEmpty();
    }

    @Test
    void 파이썬_머리_뒤의_설명_낱말은_인용_문장에_넣지_않는다() {
        assertThat(check(withGuess("4번 줄의 for i in range(1, n + 1): i가 1부터 커집니다."))).isEmpty();
    }

    @Test
    void 들여_쓴_출력_모양은_코드가_아니다() {
        assertThat(check(withPrinciple("n이 3일 때 기대 출력은\n    *****\n    ***\n    *\n입니다."))).isEmpty();
    }

    @Test
    void 학습자_코드의_변수에_다른_값을_넣는_글을_찾는다() {
        String code = """
                a, b = map(int, input().split())
                c = a - b
                print(c)
                """;

        assertThat(rules(withReference(withPrinciple("2번 줄을 c = a + b 로 바꾸세요."), code, List.of("사칙연산"))))
                .containsExactly(Rule.CODE_PATTERN);
        // 학습자 코드를 짚은 글과 수 하나를 넣는 예시는 넘긴다.
        assertThat(withReference(withGuess("2번 줄 c = a - b에서 빼고 있어요. c = 3이면 출력은 3입니다."), code,
                List.of("사칙연산"))).isEmpty();
    }

    @Test
    void 호출_앞의_대입_대상과_떨어진_호출_대상도_비교한다() {
        String code = """
                total = sum(a)
                a.append(x)
                """;

        for (String text : List.of("answer = sum(a)로 바꾸세요.", "b .append(x)로 바꾸세요.")) {
            assertThat(rules(withReference(withPrinciple(text), code, List.of("리스트")))).as(text)
                    .containsExactly(Rule.CODE_PATTERN);
        }
        assertThat(withReference(withGuess("1번 줄 total = sum(a)는 맞아요."), code, List.of("리스트"))).isEmpty();
    }

    @Test
    void 이스케이프된_따옴표와_긴_리터럴이_든_호출도_찾는다() {
        for (String text : List.of("print(\"a\\\"b\")로 바꾸세요.", "print('" + "x".repeat(320) + "')로 바꾸세요.")) {
            assertThat(rules(check(withPrinciple(text)))).as(text).containsExactly(Rule.CODE_PATTERN);
        }
    }

    @Test
    void 식에_쓰는_함수_이름과_복잡도_표기는_호출이_아니다() {
        // 3단계 원리는 규칙을 식으로 보여 준다(#82 리뷰). 라이브러리 호출 목록에 sqrt·gcd·lcm을 넣지 않는다.
        assertThat(check(withPrinciple("약수는 sqrt(n)까지만 확인하면 됩니다."))).isEmpty();
        assertThat(check(withPrinciple("최소공배수는 lcm(a, b) = a × b / gcd(a, b)로 구합니다."))).isEmpty();
        // max·min은 호출 목록에 있지만 복잡도 표기 안에서는 호출이 아니다.
        assertThat(check(withGuess("4번 줄의 이중 반복이 O(max(n, m) log n)보다 느린 O(n × m)인 것 같습니다."))).isEmpty();
        assertThat(check(withGuess("4번 줄은 O(sqrt(n))번 돕니다."))).isEmpty();
        // 표기 밖의 호출은 그대로 찾는다.
        assertThat(rules(check(withPrinciple("마지막에 max(a, b)를 출력하세요.")))).containsExactly(Rule.CODE_PATTERN);
    }

    @Test
    void 복잡도_표기_안이라도_다른_호출은_찾고_문자열_안의_표기는_인용으로_본다() {
        // 표기 안에서 건너뛰는 것은 max·min뿐이다(#82 2차 리뷰). 표기를 지우면 그 안의 고친 코드까지 놓친다.
        assertThat(rules(withReference(withPrinciple("O(n, print(sum(a)))로 합을 출력하세요."), "a = [3, 1, 2]\nprint(a)\n",
                List.of()))).containsExactly(Rule.CODE_PATTERN);
        // 글을 바꾸지 않으므로 학습자 코드의 문자열 속 표기를 그대로 짚은 글은 인용이다.
        assertThat(withReference(withGuess("1번 줄의 print(\"O(n)\")는 복잡도 문자열을 출력하고 있어요."), "print(\"O(n)\")\n",
                List.of())).isEmpty();
    }

    @Test
    void 로그에는_규칙과_위치만_남긴다() {
        List<Violation> violations = withReference(withPrinciple("동적계획법으로 range(n)까지 도세요."), "",
                List.of("동적 계획법"));

        assertThat(AnswerGuard.describe(violations))
                .isEqualTo("CODE_PATTERN@hints.principle,ALGORITHM_NAME@hints.principle(동적 계획법)");
    }

    @Test
    void 타입_이름만_말한_글은_선언이_아니다() {
        String code = """
                #include <iostream>
                int main() {
                    int a, b;
                    std::cin >> a >> b;
                    int sum = a * b;
                }
                """;

        for (String text : List.of("int 대신 long long을 쓰는 것을 생각해 보세요.", "곱이 int 범위를 넘으면 long long으로 바꿔야 합니다.",
                "unsigned int를 쓰면 음수를 담을 수 없어요.", "long long 타입은 64비트입니다.", "long double은 더 정밀합니다.")) {
            assertThat(withReference(withPrinciple(text), code, List.of("자료형"))).as(text).isEmpty();
        }
        // 이름까지 쓰면 선언이다
        assertThat(rules(withReference(withPrinciple("long long sum으로 선언하세요."), code, List.of("자료형"))))
                .containsExactly(Rule.CODE_PATTERN);
        assertThat(rules(withReference(withPrinciple("unsigned int total로 선언하세요."), code, List.of("자료형"))))
                .containsExactly(Rule.CODE_PATTERN);
    }

    @Test
    void 한_글자_태그_이름은_다른_낱말의_일부면_알고리즘_이름이_아니다() {
        assertThat(withProblem(withGuess("큐브 모양으로 쌓을 때 높이를 잘못 센 것 같아요."), List.of("큐"), "상자 쌓기")).isEmpty();
        assertThat(rules(withProblem(withPrinciple("큐에 넣은 순서대로 꺼내면 됩니다."), List.of("큐"), "상자 쌓기")))
                .containsExactly(Rule.ALGORITHM_NAME);
        for (String text : List.of("큐를 쓰면 됩니다. 우선순위 큐는 아니에요.", "핵심은 큐예요.", "큐라는 자료구조를 쓰면 됩니다.",
                "큐나 덱을 떠올려 보세요.", "이 문제는 큐다.", "큐란 먼저 넣은 것을 먼저 꺼내는 구조입니다.", "큐보다 나은 것이 없어요.",
                "큐인지 생각해 보세요.", "큐입니다.", "큐랑 비슷해요.", "먼저 큐, 그다음 배열입니다.")) {
            assertThat(rules(withProblem(withPrinciple(text), List.of("큐"), "상자 쌓기"))).as(text)
                    .containsExactly(Rule.ALGORITHM_NAME);
        }
        // 지문에 이미 나온 이름은 조사가 무엇이든 뺀다
        assertThat(withProblem(withPrinciple("큐라는 자료구조를 쓰면 됩니다."), List.of("큐"), "큐란 무엇인가")).isEmpty();
    }

    @Test
    void 닫히지_않은_따옴표나_대괄호가_이어진_큰_코드도_오래_걸리지_않는다() {
        // 제출 코드는 64KB까지다. 닫는 짝이 없는 줄을 자리마다 끝까지 다시 훑으면 글자 수의 제곱만큼 걸린다.
        List<String> codes = List.of("\"\\".repeat(32_000) + "\n", "'".repeat(64_000) + "\n", "a[".repeat(32_000) + "\n",
                "x [ ".repeat(16_000) + "\n");

        for (String code : codes) {
            assertTimeout(Duration.ofSeconds(1), () -> withReference(withPrinciple("2번 줄을 보세요."), code,
                    List.of("문자열"), code));
        }
        // 닫히지 않은 따옴표는 기호 하나로, 그 뒤는 전과 같이 나눈다
        assertThat(AnswerGuard.tokens("a = 'b\nc = \"d\" + \"e\n")).containsExactly("a", "=", "'", "b", "c", "=", "\"d\"",
                "+", "\"", "e");
    }

    private static List<Violation> check(AnalysisResult result) {
        return withReference(result, PYRAMID_CODE, List.of("반복문 범위"));
    }

    private static List<Violation> withReference(AnalysisResult result, String code, List<String> tags,
            String... references) {
        List<AnswerGuard.Reference> python = Stream.of(references).map(r -> new AnswerGuard.Reference("PYTHON", r))
                .toList();
        return AnswerGuard.check(result, new AnswerGuard.Context(code, "PYTHON", "문제", tags, python));
    }

    private static List<Violation> withProblem(AnalysisResult result, List<String> tags, String problem) {
        return AnswerGuard.check(result, new AnswerGuard.Context("", "PYTHON", problem, tags, List.of()));
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
