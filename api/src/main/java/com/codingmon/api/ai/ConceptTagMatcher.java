package com.codingmon.api.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;

// 리뷰의 다음 개념(CodeReviewResult.Concept)을 개념 태그와 맞춘다(AI_FEATURES 6절, #83).
// 모델은 태그 목록을 모르고 개념 이름을 쓰므로 서버가 맞춘다. 대상은 문제에 붙은 태그가 아니라 모든 태그다.
// 아래 단계를 차례로 보고, 한 단계에서 후보 태그가 하나면 그 태그와 잇는다. 둘 이상이면 다음 단계로 가지 않고 비운다.
// 잘못 잇는 것보다 비워 두는 편이 낫다. 원문은 그대로 남는다.
// 1. 이름이 태그 이름이나 slug와 똑같다
// 2. 공백을 빼고 소문자로 바꾸면 같다("이분탐색"과 태그 "이분 탐색")
// 3. 같은 별칭 묶음에 든다(ConceptAliases. "이진 탐색"과 태그 "이분 탐색", "DP"와 태그 "동적 계획법")
// 일부만 같은 이름("반복문 범위"와 태그 "반복문")은 잇지 않는다.
final class ConceptTagMatcher {

    record Tag(long id, String slug, String name) {
    }

    // ordinal은 응답 배열의 순서(1부터)다. tagId는 맞는 태그가 없으면 null이다.
    record Matched(int ordinal, String name, String reason, Long tagId) {
    }

    private ConceptTagMatcher() {
    }

    static List<Matched> match(List<CodeReviewResult.Concept> concepts, List<Tag> tags) {
        List<Matched> matched = new ArrayList<>(concepts.size());
        for (int i = 0; i < concepts.size(); i++) {
            CodeReviewResult.Concept concept = concepts.get(i);
            matched.add(new Matched(i + 1, concept.name(), concept.reason(), tagId(concept.name(), tags)));
        }
        return matched;
    }

    private static Long tagId(String name, List<Tag> tags) {
        String key = ConceptAliases.key(name);
        Set<String> aliases = ConceptAliases.group(name).stream().map(ConceptAliases::key).collect(Collectors.toSet());
        List<Predicate<Tag>> steps = List.of(
                tag -> tag.name().equals(name) || tag.slug().equals(name),
                tag -> ConceptAliases.key(tag.name()).equals(key) || ConceptAliases.key(tag.slug()).equals(key),
                tag -> aliases.contains(ConceptAliases.key(tag.name())) || aliases.contains(ConceptAliases.key(tag.slug())));
        for (Predicate<Tag> step : steps) {
            Set<Long> candidates = tags.stream().filter(step).map(Tag::id).collect(Collectors.toSet());
            if (!candidates.isEmpty()) {
                return candidates.size() == 1 ? candidates.iterator().next() : null;
            }
        }
        return null;
    }
}
