package com.codingmon.api.ai;

import static com.codingmon.api.judge.Verdict.ACCEPTED;

import java.util.ArrayList;
import java.util.List;

import com.codingmon.api.Language;
import com.codingmon.api.ai.AnalysisInput.HiddenCase;
import com.codingmon.api.ai.AnalysisInput.HiddenTests;
import com.codingmon.api.ai.AnalysisInput.Problem;
import com.codingmon.api.ai.AnalysisInput.Sample;
import com.codingmon.api.ai.AnalysisInput.Samples;
import com.codingmon.api.ai.AnalysisInput.Submission;
import com.codingmon.api.judge.RuntimeErrorType;
import com.codingmon.api.judge.Verdict;

// 판정별 오답 샘플(#76). 프롬프트 단위 테스트와 실제 모델 평가(AnalysisPromptIntegrationTest)가 같이 쓴다.
// forbidden은 응답에 나오면 안 되는 글이다. 정답 코드 조각(고친 줄, 함수 호출 모양)이나 입력으로 알 수 없는 틀린 사실을 넣는다.
// 수학 식(예: n × (n + 1) / 2)은 3단계 원리에서 허용하므로 넣지 않는다(AI_FEATURES 4절).
final class AnalysisSamples {

    record Case(String name, AnalysisInput input, List<String> forbidden) {

        // 테스트 이름에 입력 전체가 찍히지 않게 한다.
        @Override
        public String toString() {
            return name;
        }
    }

    private AnalysisSamples() {
    }

    static List<Case> all() {
        return List.of(reversePyramid(), missingSemicolon(), indexOutOfRange(), quadraticPairs(), storeEverything(),
                intOverflow(), joinedOutput(), hiddenOnlyTrailingSpace(), endlessLoop());
    }

    // AI_FEATURES 5절 예시. 정방향 피라미드를 냈다.
    static Case reversePyramid() {
        Problem problem = Problem.of("역방향 피라미드", "정수 n을 입력받아 별(*)로 된 피라미드를 거꾸로 출력하세요. 첫 줄에는 별이 2n − 1개 있고, 줄마다 별이 2개씩 줄어들며 왼쪽 공백이 1개씩 늘어납니다.",
                "첫째 줄에 정수 n이 주어진다.", "n줄에 걸쳐 거꾸로 된 피라미드를 출력한다. 줄 끝에는 공백을 출력하지 않는다.",
                "1 ≤ n ≤ 100", 1000, 128, List.of("반복문 범위", "인덱스 변환"));
        String code = """
                n = int(input())

                # 피라미드 출력
                for i in range(1, n + 1):
                    print(' ' * (n - i) + '*' * (2 * i - 1))
                """;
        return new Case("역방향 피라미드 (틀렸습니다)",
                new AnalysisInput(problem, Submission.of(Language.PYTHON, Verdict.WRONG_ANSWER, null, 18, 9200, code, null),
                        Samples.of(List.of(
                                Sample.of(1, Verdict.WRONG_ANSWER, null, "3\n", "*****\n ***\n  *\n", "  *\n ***\n*****\n", null, 17, 9100),
                                Sample.of(2, ACCEPTED, null, "1\n", "*\n", "*\n", null, 16, 9000))),
                        hidden(Verdict.WRONG_ANSWER, null, 7, 3, 3, 3, 3, 4, 4, 4, 2)),
                List.of("range(n, 0, -1)", "range(n,0,-1)", "range(1, n + 1)[::-1]", "reversed(range"));
    }

    static Case missingSemicolon() {
        Problem problem = Problem.of("두 수의 합", "두 정수 A와 B를 입력받아 A+B를 출력하세요.", "첫째 줄에 A와 B가 공백으로 주어진다.",
                "A+B를 출력한다.", "0 < A, B < 10", 1000, 256, List.of("입출력"));
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
        String message = """
                main.cpp: In function 'int main()':
                main.cpp:6:18: error: expected ';' before 'cout'
                    6 |     cin >> a >> b
                      |                  ^
                      |                  ;
                    7 |     cout << a + b << endl;
                      |     ~~~~
                """;
        return new Case("세미콜론 누락 (컴파일 에러)",
                new AnalysisInput(problem, Submission.of(Language.CPP, Verdict.COMPILE_ERROR, null, null, null, code, message),
                        null, null),
                List.of("cin >> a >> b;"));
    }

    static Case indexOutOfRange() {
        Problem problem = Problem.of("N개의 합", "정수 N개를 입력받아 모두 더한 값을 출력하세요.", "첫째 줄에 N, 둘째 줄에 정수 N개가 공백으로 주어진다.",
                "N개 정수의 합을 출력한다.", "1 ≤ N ≤ 100, 각 정수는 -1000 이상 1000 이하", 1000, 128, List.of("반복문 범위", "리스트"));
        String code = """
                n = int(input())
                a = list(map(int, input().split()))
                total = 0
                for i in range(n + 1):
                    total += a[i]
                print(total)
                """;
        String error = """
                Traceback (most recent call last):
                  File "script.py", line 5, in <module>
                    total += a[i]
                             ~^^^
                IndexError: list index out of range
                """;
        return new Case("반복 범위 한 칸 초과 (런타임 에러)",
                new AnalysisInput(problem,
                        Submission.of(Language.PYTHON, Verdict.RUNTIME_ERROR, RuntimeErrorType.INDEX_ERROR, 20, 9300, code, null),
                        Samples.of(List.of(Sample.of(1, Verdict.RUNTIME_ERROR, RuntimeErrorType.INDEX_ERROR, "3\n1 2 3\n", "6\n", "", error, 20, 9300))),
                        null),
                List.of("range(n)", "range(len(a))", "sum(a)"));
    }

    static Case quadraticPairs() {
        Problem problem = Problem.of("합이 K인 쌍", "서로 다른 정수 N개 중 두 수를 골라 합이 K가 되는 쌍의 개수를 출력하세요.",
                "첫째 줄에 N과 K, 둘째 줄에 정수 N개가 주어진다.", "쌍의 개수를 출력한다.",
                "1 ≤ N ≤ 100,000, 각 정수와 K의 절댓값은 10^9 이하", 1000, 256, List.of("해시", "집합"));
        String code = """
                n, k = map(int, input().split())
                a = list(map(int, input().split()))
                count = 0
                for i in range(n):
                    for j in range(i + 1, n):
                        if a[i] + a[j] == k:
                            count += 1
                print(count)
                """;
        return new Case("이중 반복 (시간 초과)",
                new AnalysisInput(problem, Submission.of(Language.PYTHON, Verdict.TIME_LIMIT_EXCEEDED, null, 3000, 21000, code, null),
                        Samples.of(List.of(
                                Sample.of(1, ACCEPTED, null, "5 6\n1 2 3 4 5\n", "2\n", "2\n", null, 18, 9100),
                                Sample.of(2, ACCEPTED, null, "3 100\n1 2 3\n", "0\n", "0\n", null, 17, 9000))),
                        hiddenBySize(Verdict.TIME_LIMIT_EXCEEDED)),
                List.of("set()", "in seen", "seen.add", "k - x in", "k - a[i] in"));
    }

    static Case storeEverything() {
        Problem problem = Problem.of("1부터 N까지의 합", "정수 N을 입력받아 1부터 N까지의 합을 1,000,000,007로 나눈 나머지를 출력하세요.",
                "첫째 줄에 N이 주어진다.", "합을 1,000,000,007로 나눈 나머지를 출력한다.", "1 ≤ N ≤ 100,000,000", 2000, 128,
                List.of("수학", "나머지 연산"));
        String code = """
                n = int(input())
                numbers = list(range(1, n + 1))
                print(sum(numbers) % 1000000007)
                """;
        return new Case("모든 수를 리스트에 저장 (메모리 초과)",
                new AnalysisInput(problem, Submission.of(Language.PYTHON, Verdict.MEMORY_LIMIT_EXCEEDED, null, 900, 131072, code, null),
                        Samples.of(List.of(Sample.of(1, ACCEPTED, null, "10\n", "55\n", "55\n", null, 16, 9000))),
                        hiddenBySize(Verdict.MEMORY_LIMIT_EXCEEDED)),
                List.of("n * (n + 1) // 2", "n*(n+1)//2", "(n + 1) // 2"));
    }

    static Case intOverflow() {
        Problem problem = Problem.of("큰 수의 합", "정수 N개를 입력받아 합을 출력하세요.", "첫째 줄에 N, 둘째 줄에 정수 N개가 주어진다.",
                "N개 정수의 합을 출력한다.", "1 ≤ N ≤ 100,000, 각 정수는 1 이상 1,000,000,000 이하", 1000, 256,
                List.of("자료형 범위"));
        String code = """
                #include <iostream>
                using namespace std;

                int main() {
                    int n;
                    cin >> n;
                    int sum = 0;
                    for (int i = 0; i < n; i++) {
                        int x;
                        cin >> x;
                        sum += x;
                    }
                    cout << sum << '\\n';
                    return 0;
                }
                """;
        return new Case("int 합계 넘침 (틀렸습니다)",
                new AnalysisInput(problem, Submission.of(Language.CPP, Verdict.WRONG_ANSWER, null, 40, 3200, code, null),
                        Samples.of(List.of(
                                Sample.of(1, ACCEPTED, null, "3\n1 2 3\n", "6\n", "6\n", null, 2, 3100),
                                Sample.of(2, ACCEPTED, null, "2\n10 20\n", "30\n", "30\n", null, 2, 3100))),
                        hiddenBySize(Verdict.WRONG_ANSWER)),
                List.of("long long sum", "long long sum = 0;", "int64_t sum"));
    }

    static Case joinedOutput() {
        Problem problem = Problem.of("한 줄로 출력", "정수 N을 입력받아 1부터 N까지를 한 줄에 공백으로 구분해 출력하세요.", "첫째 줄에 N이 주어진다.",
                "1부터 N까지를 한 줄에 공백 하나로 구분해 출력한다.", "1 ≤ N ≤ 1,000", 1000, 128, List.of("출력 형식"));
        String code = """
                n = int(input())
                for i in range(1, n + 1):
                    print(i)
                """;
        return new Case("줄마다 출력 (출력 형식이 잘못되었습니다)",
                new AnalysisInput(problem, Submission.of(Language.PYTHON, Verdict.PRESENTATION_ERROR, null, 17, 9000, code, null),
                        Samples.of(List.of(Sample.of(1, Verdict.PRESENTATION_ERROR, null, "3\n", "1 2 3\n", "1\n2\n3\n", null, 17, 9000))),
                        hidden(Verdict.PRESENTATION_ERROR, null, 8, 1, 3, 10, 50, 120, 400, 900, 2000, 3800)),
                List.of("end=' '", "end=\" \"", "' '.join", "\" \".join", "print(*range"));
    }

    // 예제는 통과하고 N = 1인 비공개 입력에서만 줄 끝 공백이 남는다. 입력 크기가 모두 비슷해(sameSize) 크기 등급은 MEDIUM이고
    // smallestFailed는 false다. 예제 차이나 "가장 작은 입력은 통과"를 원인으로 쓰면 안 된다.
    static Case hiddenOnlyTrailingSpace() {
        Problem problem = Problem.of("단어 이어 쓰기", "단어 N개를 입력받아 한 줄에 공백 하나로 구분해 출력하세요.",
                "첫째 줄에 N, 둘째 줄에 단어 N개가 공백으로 주어진다.", "단어를 공백 하나로 구분해 한 줄에 출력한다. 줄 끝에는 공백을 출력하지 않는다.",
                "1 ≤ N ≤ 3, 단어는 알파벳 소문자 2글자", 1000, 128, List.of("출력 형식", "조건문"));
        String code = """
                n = int(input())
                words = input().split()
                if n == 1:
                    print(words[0] + ' ')
                else:
                    print(' '.join(words))
                """;
        return new Case("N = 1에서만 줄 끝 공백 (출력 형식이 잘못되었습니다, 비공개만 실패)",
                new AnalysisInput(problem, Submission.of(Language.PYTHON, Verdict.PRESENTATION_ERROR, null, 17, 9000, code, null),
                        Samples.of(List.of(
                                Sample.of(1, ACCEPTED, null, "3\nab cd ef\n", "ab cd ef\n", "ab cd ef\n", null, 17, 9000),
                                Sample.of(2, ACCEPTED, null, "2\nxy zw\n", "xy zw\n", "xy zw\r\n", null, 17, 9000))),
                        hidden(Verdict.PRESENTATION_ERROR, null, 2, 5, 5, 8, 8, 8, 9, 9, 9)),
                List.of("가장 작은 입력은 통과", "가장 작은 입력에서는 통과", "가장 작은 입력에서 통과", "print(words[0])"));
    }

    static Case endlessLoop() {
        Problem problem = Problem.of("1부터 N까지", "정수 N을 입력받아 1부터 N까지 한 줄에 하나씩 출력하세요.", "첫째 줄에 N이 주어진다.",
                "1부터 N까지 한 줄에 하나씩 출력한다.", "1 ≤ N ≤ 100", 1000, 128, List.of("반복문"));
        String code = """
                n = int(input())
                i = 1
                while i <= n:
                    print(i)
                """;
        return new Case("증가 없는 while (출력 초과)",
                new AnalysisInput(problem, Submission.of(Language.PYTHON, Verdict.OUTPUT_LIMIT_EXCEEDED, null, 210, 9100, code, null),
                        Samples.of(List.of(Sample.of(1, Verdict.OUTPUT_LIMIT_EXCEEDED, null, "3\n", "1\n2\n3\n", "1\n".repeat(400),
                                null, 210, 9100))),
                        hidden(Verdict.OUTPUT_LIMIT_EXCEEDED, null, 8, 2, 2, 3, 3, 3, 3, 4, 4)),
                List.of("i += 1", "i+=1", "i = i + 1", "for i in range"));
    }

    // 앞에서 failed개가 실패한 비공개 케이스. 입력 바이트 수는 bytes 순서대로다.
    private static HiddenTests hidden(Verdict verdict, RuntimeErrorType type, int failed, int... bytes) {
        List<HiddenCase> cases = new ArrayList<>();
        for (int i = 0; i < bytes.length; i++) {
            cases.add(new HiddenCase(i < failed ? verdict : ACCEPTED, i < failed ? type : null, bytes[i]));
        }
        return HiddenTests.of(cases);
    }

    // 작은 입력은 통과하고 큰 입력 둘에서만 실패한다.
    private static HiddenTests hiddenBySize(Verdict verdict) {
        return HiddenTests.of(List.of(new HiddenCase(ACCEPTED, null, 6), new HiddenCase(ACCEPTED, null, 20),
                new HiddenCase(ACCEPTED, null, 300), new HiddenCase(ACCEPTED, null, 2_000),
                new HiddenCase(ACCEPTED, null, 40_000), new HiddenCase(ACCEPTED, null, 90_000),
                new HiddenCase(verdict, null, 700_000), new HiddenCase(verdict, null, 1_100_000)));
    }
}
