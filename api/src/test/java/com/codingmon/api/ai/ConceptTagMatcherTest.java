package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.codingmon.api.ai.ConceptTagMatcher.Matched;
import com.codingmon.api.ai.NextConceptRepository.Tag;

// 다음 개념과 개념 태그를 맞추는 규칙(AI_FEATURES 6절, #83). DB에 저장하는 것은 CodeReviewControllerTest와 NextConceptRepositoryTest가 본다.
class ConceptTagMatcherTest {

    private static final Tag BINARY_SEARCH = new Tag(1, "binary-search", "이분 탐색");
    private static final Tag GREEDY = new Tag(2, "greedy", "그리디");
    private static final Tag DYNAMIC = new Tag(3, "dynamic-programming", "동적 계획법");
    private static final Tag LOOP = new Tag(4, "loop", "반복문");
    private static final List<Tag> TAGS = List.of(BINARY_SEARCH, GREEDY, DYNAMIC, LOOP);

    @Test
    void 이름이나_slug가_같으면_그_태그와_잇는다() {
        assertThat(tagOf("이분 탐색", TAGS)).isEqualTo(1L);
        assertThat(tagOf("greedy", TAGS)).isEqualTo(2L);
    }

    @Test
    void 띄어쓰기와_대소문자만_달라도_잇는다() {
        assertThat(tagOf("이분탐색", TAGS)).isEqualTo(1L);
        assertThat(tagOf("동적  계획법", TAGS)).isEqualTo(3L);
        assertThat(tagOf("Greedy", TAGS)).isEqualTo(2L);
        assertThat(tagOf("BINARY-SEARCH", TAGS)).isEqualTo(1L);
    }

    @Test
    void 별칭이면_그_묶음의_태그와_잇는다() {
        assertThat(tagOf("이진 탐색", TAGS)).isEqualTo(1L);
        assertThat(tagOf("binary search", TAGS)).isEqualTo(1L);
        assertThat(tagOf("DP", TAGS)).isEqualTo(3L);
        assertThat(tagOf("메모이제이션", TAGS)).isEqualTo(3L);
        assertThat(tagOf("탐욕법", TAGS)).isEqualTo(2L);
    }

    @Test
    void 일부만_같은_이름은_잇지_않는다() {
        assertThat(tagOf("반복문 범위", TAGS)).isNull();
        assertThat(tagOf("이분 탐색의 경계", TAGS)).isNull();
    }

    @Test
    void 앞_단계에서_하나로_정해지면_뒤_단계는_보지_않는다() {
        // 이름만 띄어쓰기가 다른 두 태그. 똑같은 이름이 있으면 그것과 잇는다.
        List<Tag> tags = List.of(new Tag(10, "a", "이분 탐색"), new Tag(11, "b", "이분탐색"));

        assertThat(tagOf("이분탐색", tags)).isEqualTo(11L);
        assertThat(tagOf("이분 탐색", tags)).isEqualTo(10L);
    }

    @Test
    void 한_단계에_후보가_둘이면_잇지_않는다() {
        // 공백을 빼면 둘 다 같다
        List<Tag> spaced = List.of(new Tag(10, "a", "이분 탐색"), new Tag(11, "b", "이분탐색"));
        assertThat(tagOf("이분  탐색", spaced)).isNull();

        // "딕셔너리"는 해시맵 묶음이고 그 묶음에 태그가 둘 있다. 어느 쪽으로도 잇지 않는다.
        List<Tag> hashes = List.of(new Tag(20, "hash", "해시"), new Tag(21, "hash-map", "해시맵"));
        assertThat(tagOf("딕셔너리", hashes)).isNull();
    }

    @Test
    void 이름과_slug가_같은_태그는_후보_하나로_센다() {
        List<Tag> tags = List.of(new Tag(30, "그리디", "그리디"));

        assertThat(tagOf("그리디", tags)).isEqualTo(30L);
    }

    @Test
    void 맞는_태그가_없어도_원문과_순서를_그대로_둔다() {
        List<CodeReviewResult.Concept> concepts = List.of(
                new CodeReviewResult.Concept("수열의 합 공식", "반복 없이  식 하나로\n합을 구할 수 있어요."),
                new CodeReviewResult.Concept("이진 탐색", "정렬된 값에서 찾을 때 좋아요."),
                new CodeReviewResult.Concept(" 반복문 범위 ", "끝 값을 다시 보세요."));

        assertThat(ConceptTagMatcher.match(concepts, TAGS)).containsExactly(
                new Matched(1, "수열의 합 공식", "반복 없이  식 하나로\n합을 구할 수 있어요.", null),
                new Matched(2, "이진 탐색", "정렬된 값에서 찾을 때 좋아요.", 1L),
                new Matched(3, " 반복문 범위 ", "끝 값을 다시 보세요.", null));
        assertThat(ConceptTagMatcher.match(concepts, List.of())).extracting(Matched::tagId).containsOnlyNulls();
    }

    private static Long tagOf(String name, List<Tag> tags) {
        return ConceptTagMatcher.match(List.of(new CodeReviewResult.Concept(name, "이유")), tags).get(0).tagId();
    }
}
