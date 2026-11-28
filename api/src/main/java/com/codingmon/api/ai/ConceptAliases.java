package com.codingmon.api.ai;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// 개념 태그마다 같은 뜻의 다른 이름. 두 곳이 같이 쓴다. 한쪽을 위해 고치면 다른 쪽도 바뀐다.
// - 정답 코드 검사(AnswerGuard)가 응답에서 알고리즘 이름을 찾을 때
// - 리뷰의 다음 개념을 개념 태그와 맞출 때(ConceptTagMatcher, #83)
// "메모이제이션"·"해시"처럼 같은 뜻은 아니지만 가까운 이름도 들어 있다. 검사는 넓게 잡는 편이 안전하고,
// 매칭은 원문을 함께 남기므로 받아들인다.
final class ConceptAliases {

    // 대표 이름(공백을 뺀 태그 이름)과 다른 이름들
    private static final Map<String, List<String>> ALIASES = Map.ofEntries(
            Map.entry("동적계획법", List.of("동적 프로그래밍", "다이나믹 프로그래밍", "메모이제이션", "DP")),
            Map.entry("너비우선탐색", List.of("너비 우선", "넓이 우선 탐색", "BFS")),
            Map.entry("깊이우선탐색", List.of("깊이 우선", "DFS")),
            Map.entry("이분탐색", List.of("이진 탐색", "이분법", "binary search")),
            Map.entry("그리디", List.of("탐욕법", "탐욕 알고리즘", "greedy")),
            Map.entry("누적합", List.of("부분합", "prefix sum")),
            Map.entry("투포인터", List.of("두 포인터", "two pointer")),
            Map.entry("해시맵", List.of("해시", "딕셔너리", "hash", "dictionary")),
            Map.entry("스택", List.of("stack")),
            Map.entry("큐", List.of("queue")),
            Map.entry("정렬", List.of("sorting")),
            Map.entry("완전탐색", List.of("브루트 포스", "전수 조사", "brute force")),
            Map.entry("백트래킹", List.of("backtracking")),
            Map.entry("분할정복", List.of("divide and conquer")),
            Map.entry("다익스트라", List.of("Dijkstra")),
            Map.entry("유니온파인드", List.of("분리 집합", "union find")),
            Map.entry("비트마스킹", List.of("비트마스크", "bitmask")),
            Map.entry("슬라이딩윈도우", List.of("sliding window")));

    // 묶음 안의 어느 이름으로 찾아도 같은 묶음이 나온다(태그 "해시"와 키 "해시맵", 태그 "이진 탐색"과 키 "이분탐색").
    private static final Map<String, List<String>> GROUPS = groups();

    private ConceptAliases() {
    }

    // name이 든 묶음(대표 이름 포함). 띄어쓰기와 대소문자는 가리지 않는다. 묶음에 없는 이름이면 빈 목록이다.
    static List<String> group(String name) {
        return GROUPS.getOrDefault(key(name), List.of());
    }

    // 비교용 키. 공백을 빼고 소문자로 바꾼다.
    static String key(String name) {
        return name.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    private static Map<String, List<String>> groups() {
        Map<String, List<String>> groups = new HashMap<>();
        ALIASES.forEach((key, aliases) -> {
            List<String> group = new ArrayList<>();
            group.add(key);
            group.addAll(aliases);
            group.forEach(name -> groups.put(key(name), List.copyOf(group)));
        });
        return Map.copyOf(groups);
    }
}
