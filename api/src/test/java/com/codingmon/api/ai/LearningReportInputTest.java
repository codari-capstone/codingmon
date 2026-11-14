package com.codingmon.api.ai;

import static com.codingmon.api.ai.LearningReportSamples.next;
import static com.codingmon.api.ai.LearningReportSamples.stat;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

import com.codingmon.api.learning.LearningStatsRepository.ConceptStat;
import com.codingmon.api.learning.LearningStatsRepository.LearningStats;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class LearningReportInputTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    void 수치는_화면_표기_그대로_문자열로_준다() {
        assertThat(LearningReportInput.percent(new BigDecimal("0.49"))).isEqualTo("49%");
        assertThat(LearningReportInput.percent(new BigDecimal("1.00"))).isEqualTo("100%");
        assertThat(LearningReportInput.percent(new BigDecimal("0.00"))).isEqualTo("0%");
        assertThat(LearningReportInput.plain(new BigDecimal("1.50"))).isEqualTo("1.5");
        assertThat(LearningReportInput.plain(new BigDecimal("3.17"))).isEqualTo("3.17");
        assertThat(LearningReportInput.plain(new BigDecimal("2.00"))).isEqualTo("2");
        assertThat(LearningReportInput.plain(new BigDecimal("10.00"))).isEqualTo("10");
        assertThat(LearningReportInput.plain(new BigDecimal("0.00"))).isEqualTo("0");
    }

    @Test
    void 개념별_통계는_취약한_순서를_지키고_slug와_취약_점수를_넣지_않는다() {
        JsonNode json = JSON.readTree(LearningReportSamples.typical().input().toJson());

        assertThat(json.get("solvedProblemCount").asInt()).isEqualTo(9);
        assertThat(json.get("concepts")).extracting(c -> c.get("name").asString())
                .containsExactly("반복문 범위", "인덱스 변환", "조건문", "문자열");
        JsonNode first = json.get("concepts").get(0);
        assertThat(first.propertyNames()).containsExactly("name", "weak", "problemCount", "solvedCount", "solveRate",
                "averageAttempts", "averageHintLevel");
        assertThat(first.get("weak").asBoolean()).isTrue();
        assertThat(first.get("solveRate").asString()).isEqualTo("50%");
        assertThat(first.get("averageAttempts").asString()).isEqualTo("3.17");
        assertThat(json.get("concepts").get(3).get("averageHintLevel").asString()).isEqualTo("0");
        assertThat(json.toString()).doesNotContain("slug", "loop-range", "weaknessScore", "0.53");
    }

    @Test
    void 추천은_한국어_난이도로_주고_도전_문제는_개념을_뺀다() {
        JsonNode json = JSON.readTree(LearningReportSamples.oneWeak().input().toJson());

        JsonNode recommendations = json.get("recommendations");
        assertThat(recommendations.get(0).propertyNames()).containsExactly("rank", "title", "difficulty", "concept", "attempted");
        assertThat(recommendations.get(0).get("difficulty").asString()).isEqualTo("보통");
        assertThat(recommendations.get(0).get("concept").asString()).isEqualTo("나머지 연산");
        assertThat(recommendations.get(1).get("difficulty").asString()).isEqualTo("어려움");
        assertThat(recommendations.get(1).has("concept")).isFalse();
        assertThat(json.toString()).doesNotContain("EASY", "MEDIUM", "HARD");
    }

    @Test
    void 모르는_난이도는_받지_않는다() {
        assertThatThrownBy(() -> LearningReportInput.Recommendation.of(1, "제목", "VERY_HARD", null, false))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 맞힌_문제가_모자라면_리포트_입력을_만들지_않는다() {
        LearningStats notYet = new LearningStats(3, 5, 2, List.of());

        assertThatThrownBy(() -> LearningReportInput.of(notYet, List.of(), List.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 취약_개념과_추천_순위를_입력_순서대로_준다() {
        LearningReportInput typical = LearningReportSamples.typical().input();

        assertThat(typical.weakConceptNames()).containsExactly("반복문 범위", "인덱스 변환");
        assertThat(typical.recommendationRanks()).containsExactly(1, 2, 3);
        assertThat(LearningReportSamples.noWeak().input().weakConceptNames()).isEmpty();
        // 2위 개념은 0점이라 취약 개념이 아니다.
        assertThat(LearningReportSamples.oneWeak().input().weakConceptNames()).containsExactly("나머지 연산");
    }

    @Test
    void 다음_개념은_태그나_이름으로_모아_많이_나온_순으로_준다() {
        List<LearningReportInput.NextConcept> gathered = LearningReportSamples.typical().input().nextConcepts();

        // 누적합은 원문이 달라도("누적 합") 같은 태그라 모인다. 빠른 입출력은 태그가 없지만 띄어쓰기만 다른 같은 이름이다.
        assertThat(gathered).extracting(LearningReportInput.NextConcept::name)
                .containsExactly("누적합", "빠른 입출력", "리스트 슬라이싱");
        LearningReportInput.NextConcept prefixSum = gathered.get(0);
        assertThat(prefixSum.count()).isEqualTo(2);
        assertThat(prefixSum.problems()).containsExactly("홀수 자리 숫자 더하기", "반 평균 키 구하기");
        // 이유는 가장 최근 리뷰의 것이다.
        assertThat(prefixSum.reason()).startsWith("구간마다 합을");
        assertThat(gathered.get(1).problems()).containsExactly("홀수 자리 숫자 더하기", "글자 바꾸기 놀이");
    }

    @Test
    void 다음_개념의_이름은_맞춘_태그_이름이다() {
        List<LearningReportInput.NextConcept> gathered = LearningReportSamples.oneWeak().input().nextConcepts();

        // 같은 횟수면 최근에 나온 순서다.
        assertThat(gathered).extracting(LearningReportInput.NextConcept::name).containsExactly("문자열 포매팅", "반복문 범위");
        assertThat(LearningReportSamples.noWeak().input().nextConcepts()).isEmpty();
    }

    @Test
    void 다음_개념은_정해진_수까지만_넣고_문제_제목은_한_번씩만_넣는다() {
        List<NextConceptRepository.NextConcept> recent = List.of(
                next(9, "가", 1, "하나", "이유", null),
                next(9, "가", 2, "둘", "이유", null),
                next(8, "나", 1, "셋", "이유", null),
                next(7, "다", 1, "넷", "이유", null),
                next(6, "라", 1, "다섯", "이유", null),
                next(5, "마", 1, "여섯", "이유", null),
                next(4, "바", 1, "여섯", "이유", null),
                next(3, "바", 2, "여섯", "이유", null),
                next(2, "사", 1, "여섯", "이유", null),
                next(1, "아", 1, "여섯", "이유", null));

        List<LearningReportInput.NextConcept> gathered = LearningReportInput.gather(recent);

        assertThat(gathered).hasSize(LearningReportInput.NEXT_CONCEPT_MAX_COUNT);
        assertThat(gathered).extracting(LearningReportInput.NextConcept::name).containsExactly("여섯", "하나", "둘", "셋", "넷");
        assertThat(gathered.get(0).count()).isEqualTo(5);
        assertThat(gathered.get(0).problems()).containsExactly("마", "바", "사");
    }

    @Test
    void 긴_제목과_이유는_잘라서_넣는다() {
        LearningReportInput.Recommendation long_ = LearningReportInput.Recommendation.of(1, "가".repeat(150), "EASY", null, false);
        List<LearningReportInput.NextConcept> gathered = LearningReportInput.gather(
                List.of(next(1, "나".repeat(150), 1, "개념", "다".repeat(400), null)));

        assertThat(long_.title()).startsWith("가".repeat(LearningReportInput.TITLE_MAX_CHARS)).endsWith("자 생략]");
        assertThat(gathered.get(0).problems().get(0)).startsWith("나".repeat(LearningReportInput.TITLE_MAX_CHARS));
        assertThat(gathered.get(0).reason()).startsWith("다".repeat(LearningReportInput.NEXT_CONCEPT_REASON_MAX_CHARS))
                .endsWith("100자 생략]");
    }

    @Test
    void 개념_통계가_많아도_입력은_작다() {
        // 개념 태그는 수십 개다. 모든 태그를 넣고 다음 개념과 추천이 상한에 닿아도 프롬프트 몫이 작다.
        List<ConceptStat> concepts = IntStream.range(0, 40)
                .mapToObj(i -> stat("tag-" + i, "개념 이름 " + "가".repeat(20) + i, 12, 7, "0.58", "2.42", "1.33", "0.30", i < 2))
                .toList();
        List<LearningReportInput.Recommendation> recommendations = IntStream.rangeClosed(1, 3)
                .mapToObj(rank -> LearningReportInput.Recommendation.of(rank, "제".repeat(150), "HARD", "개념", true)).toList();
        List<NextConceptRepository.NextConcept> recent = IntStream.range(0, 30)
                .mapToObj(i -> next(100 - i, "문".repeat(150), 1, "개념 " + (i % 5), "이".repeat(300), null)).toList();

        String json = LearningReportInput.of(new LearningStats(40, 5, 0, concepts), recommendations, recent).toJson();

        assertThat(json.length()).isLessThan(10_000);
    }
}
