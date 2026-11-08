package com.codingmon.api.ai;

import java.util.List;

import com.codingmon.api.Language;
import com.codingmon.api.ai.AnalysisInput.Problem;
import com.codingmon.api.ai.AnalysisInput.Submission;
import com.codingmon.api.judge.Verdict;

// 정답 제출 샘플 5개(#82). 프롬프트 단위 테스트와 실제 모델 평가(CodeReviewPromptIntegrationTest)가 같이 쓴다.
// 이 저장소는 공개다. 플랫폼에 등록하는 문제(비공개 problems 저장소)와 겹치지 않는 연습 문제만 쓴다.
// forbidden은 응답에 나오면 안 되는 글이다. 학습자 코드에 없는, 고친 코드 조각(호출 모양, 고친 줄)을 넣는다.
// meetsIntended는 사람이 평가할 때 비교할 기대값이다. null이면 제약과 태그로 어느 쪽이라고도 볼 수 있다.
final class CodeReviewSamples {

    record Case(String name, CodeReviewInput input, List<String> forbidden, Boolean meetsIntended) {

        // 테스트 이름에 입력 전체가 찍히지 않게 한다.
        @Override
        public String toString() {
            return name;
        }
    }

    private CodeReviewSamples() {
    }

    static List<Case> all() {
        return List.of(rectangle(), squareSum(), distinctCount(), sortScores(), countAtMost());
    }

    // O(1). 개선할 것은 의미 없는 변수 이름 정도다.
    static Case rectangle() {
        Problem problem = Problem.of("직사각형의 넓이와 둘레", "가로 W, 세로 H인 직사각형의 넓이와 둘레를 출력하세요.",
                "첫째 줄에 W와 H가 공백으로 주어진다.", "첫째 줄에 넓이, 둘째 줄에 둘레를 출력한다.", "1 ≤ W, H ≤ 10,000",
                1000, 128, List.of("사칙연산", "입출력"));
        String code = """
                a, b = map(int, input().split())
                c = a * b
                d = (a + b) * 2
                print(c)
                print(d)
                """;
        return new Case("직사각형 넓이와 둘레 (파이썬, O(1))",
                input(problem, Language.PYTHON, 16, 9100, code),
                List.of("width, height = map", "w, h = map", "print(a * b"), true);
    }

    // O(n) 반복으로 제곱을 더한다. 식 하나로 구할 수 있지만 제약(N ≤ 1,000,000)은 반복도 허용한다.
    static Case squareSum() {
        Problem problem = Problem.of("제곱수의 합", "정수 N을 입력받아 1² + 2² + … + N²의 값을 출력하세요.",
                "첫째 줄에 N이 주어진다.", "제곱수의 합을 출력한다.", "1 ≤ N ≤ 1,000,000", 1000, 128, List.of("수학", "반복문"));
        String code = """
                n = int(input())
                total = 0
                for i in range(1, n + 1):
                    total = total + i * i
                print(total)
                """;
        return new Case("제곱수의 합 (파이썬, O(n) 반복)",
                input(problem, Language.PYTHON, 230, 9300, code),
                List.of("total += i", "sum(i * i", "sum(i*i", "(2 * n + 1) // 6", "sum(range("), null);
    }

    // 집합으로 O(n). 리스트를 집합으로 바로 바꿀 수 있다.
    static Case distinctCount() {
        Problem problem = Problem.of("서로 다른 수의 개수", "정수 N개가 주어질 때 서로 다른 수가 몇 개인지 출력하세요.",
                "첫째 줄에 N, 둘째 줄에 정수 N개가 공백으로 주어진다.", "서로 다른 수의 개수를 출력한다.",
                "1 ≤ N ≤ 200,000, 각 정수의 절댓값은 10^9 이하", 1000, 256, List.of("집합"));
        String code = """
                n = int(input())
                nums = list(map(int, input().split()))
                seen = set()
                for x in nums:
                    seen.add(x)
                print(len(seen))
                """;
        return new Case("서로 다른 수의 개수 (파이썬, 집합)",
                input(problem, Language.PYTHON, 60, 31000, code),
                List.of("len(set(nums))", "set(nums)", "set(map(int"), true);
    }

    // 정렬 O(n log n)은 의도와 같다. 줄마다 endl로 버퍼를 비우는 출력이 느리다.
    static Case sortScores() {
        Problem problem = Problem.of("점수 오름차순 정렬", "학생 N명의 점수를 오름차순으로 한 줄에 하나씩 출력하세요.",
                "첫째 줄에 N, 다음 N줄에 점수가 하나씩 주어진다.", "정렬한 점수를 한 줄에 하나씩 출력한다.",
                "1 ≤ N ≤ 200,000, 0 ≤ 점수 ≤ 1,000,000", 1000, 256, List.of("정렬"));
        String code = """
                #include <bits/stdc++.h>
                using namespace std;

                int main() {
                    int n;
                    cin >> n;
                    vector<int> scores(n);
                    for (int i = 0; i < n; i++) {
                        cin >> scores[i];
                    }
                    sort(scores.begin(), scores.end());
                    for (int i = 0; i < n; i++) {
                        cout << scores[i] << endl;
                    }
                    return 0;
                }
                """;
        return new Case("점수 정렬 (C++, 줄마다 endl)",
                input(problem, Language.CPP, 420, 3900, code),
                List.of("sync_with_stdio(false)", "cin.tie(", "<< '\\n'", "<< \"\\n\""), true);
    }

    // 질의마다 전체를 훑는 O(N·Q). 제약이 작아 통과했지만 태그는 정렬 뒤 이분 탐색을 가리킨다.
    static Case countAtMost() {
        Problem problem = Problem.of("x 이하인 수 세기", "정수 N개가 주어진다. 질의 Q개마다 정수 x가 주어지면 N개 중 x 이하인 수의 개수를 출력하세요.",
                "첫째 줄에 N과 Q, 둘째 줄에 정수 N개, 다음 Q줄에 x가 하나씩 주어진다.", "질의마다 한 줄에 개수를 출력한다.",
                "1 ≤ N, Q ≤ 2,000, 각 정수와 x의 절댓값은 10^9 이하", 2000, 256, List.of("정렬", "이분 탐색"));
        String code = """
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
        return new Case("x 이하인 수 세기 (파이썬, 질의마다 전체 탐색)",
                input(problem, Language.PYTHON, 1400, 9800, code),
                List.of("bisect_right(", "bisect(", "a.sort()", "sorted(a)", "sys.stdin.readline()"), false);
    }

    private static CodeReviewInput input(Problem problem, Language language, int timeMs, int memoryKb, String code) {
        return new CodeReviewInput(problem, Submission.of(language, Verdict.ACCEPTED, null, timeMs, memoryKb, code, null));
    }
}
