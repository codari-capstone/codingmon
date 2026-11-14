package com.codingmon.api.ai;

import static com.codingmon.api.ai.JsonSchemas.ordered;
import static com.codingmon.api.ai.JsonSchemas.text;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

// 학습 리포트(F4) 응답(AI_FEATURES 7절). learning_reports.content에 저장한다(#85).
// 수치와 목록은 담지 않는다. 화면의 수치·취약 개념·추천 문제는 서버 값(learning_reports.statistics, learning_report_recommendations)을
// 쓰고, 이 응답은 그 옆에 붙는 문장뿐이다. 문장 속 수치는 #85가 통계와 대조한다.
// 취약 개념과 추천은 입력의 개념 이름·순위로 맞춘다. 개수와 이름·순위는 입력마다 만드는 스키마(schema)가 묶고, 순서는 alignedTo가 맞춘다.
// 글자 수 상한은 CodeReviewResult와 같은 이유로 스키마에만 둔다.
record LearningReportResult(
        @NotNull @Size(max = MAX_WEAK_CONCEPTS) List<@NotNull @Valid WeakConcept> weakConcepts,
        @NotNull @Size(max = MAX_RECOMMENDATIONS) List<@NotNull @Valid RecommendationReason> recommendations,
        @NotBlank String summary) {

    // 취약 개념은 취약 점수 상위 2개 태그다(LearningStatsRepository).
    static final int MAX_WEAK_CONCEPTS = 2;
    // 추천은 많아야 3개다(RecommendationRepository, learning_report_recommendations.rank CHECK 1~3).
    static final int MAX_RECOMMENDATIONS = 3;
    static final int SUMMARY_MAX_CHARS = 400;
    static final int EXPLANATION_MAX_CHARS = 300;
    static final int PRACTICE_MAX_CHARS = 300;
    static final int REASON_MAX_CHARS = 200;
    // 취약 개념이 없을 때만 쓰는 상한(concept_tags.name은 100자). 있으면 이름을 enum으로 묶는다.
    static final int CONCEPT_NAME_MAX_CHARS = 100;

    // concept는 입력의 개념 이름 그대로다.
    record WeakConcept(
            @NotBlank String concept,
            @NotBlank String explanation,
            @NotBlank String practice) {
    }

    // rank는 입력의 추천 순위 그대로다(learning_report_recommendations.rank).
    record RecommendationReason(
            int rank,
            @NotBlank String reason) {
    }

    static final String SCHEMA_NAME = "learning_report";

    // 입력마다 만든다. 취약 개념과 추천은 입력과 같은 개수만 쓰게 하고(minItems = maxItems), 이름과 순위는 입력에 있는 값만 고르게 한다(enum).
    // 엔진은 스키마로 출력 문법을 만들므로 모델이 목록을 빼거나 늘리거나 다른 이름을 쓰지 못한다. 같은 이름을 두 번 쓰는 것과 순서는
    // 스키마로 막지 못해 alignedTo가 본다.
    // 키 순서를 고정한다(JsonSchemas). 개념별 설명과 추천 이유를 먼저 쓰고 요약을 마지막에 쓰게 한다.
    static Map<String, Object> schema(LearningReportInput input) {
        List<String> weak = input.weakConceptNames();
        List<Integer> ranks = input.recommendationRanks();
        return ordered(
                "type", "object",
                "additionalProperties", false,
                "required", List.of("weakConcepts", "recommendations", "summary"),
                "properties", ordered(
                        "weakConcepts", exactly(weak.size(), ordered(
                                "type", "object",
                                "additionalProperties", false,
                                "required", List.of("concept", "explanation", "practice"),
                                "properties", ordered(
                                        "concept", weak.isEmpty() ? text(CONCEPT_NAME_MAX_CHARS)
                                                : ordered("type", "string", "enum", weak),
                                        "explanation", text(EXPLANATION_MAX_CHARS),
                                        "practice", text(PRACTICE_MAX_CHARS)))),
                        "recommendations", exactly(ranks.size(), ordered(
                                "type", "object",
                                "additionalProperties", false,
                                "required", List.of("rank", "reason"),
                                "properties", ordered(
                                        "rank", ranks.isEmpty()
                                                ? ordered("type", "integer", "minimum", 1, "maximum", MAX_RECOMMENDATIONS)
                                                : ordered("type", "integer", "enum", ranks),
                                        "reason", text(REASON_MAX_CHARS)))),
                        "summary", text(SUMMARY_MAX_CHARS)));
    }

    // 입력의 순서(취약 개념은 취약한 순, 추천은 순위 순)로 다시 놓는다. 스키마가 개수와 값을 묶으므로 어긋나는 것은 순서와 되풀이뿐이다.
    // 입력의 이름·순위가 저마다 한 번씩 나오지 않으면 빈 값이다. 그때 다시 만들지, 실패로 둘지는 리포트를 만드는 쪽(#85)이 정한다.
    Optional<LearningReportResult> alignedTo(LearningReportInput input) {
        Optional<List<WeakConcept>> concepts = align(weakConcepts, WeakConcept::concept, input.weakConceptNames());
        Optional<List<RecommendationReason>> reasons = align(recommendations, RecommendationReason::rank,
                input.recommendationRanks());
        if (concepts.isEmpty() || reasons.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new LearningReportResult(concepts.get(), reasons.get(), summary));
    }

    private static <T, K> Optional<List<T>> align(List<T> items, Function<T, K> key, List<K> expected) {
        if (items.size() != expected.size()) {
            return Optional.empty();
        }
        List<T> aligned = new ArrayList<>();
        for (K k : expected) {
            List<T> matched = items.stream().filter(item -> key.apply(item).equals(k)).toList();
            if (matched.size() != 1) {
                return Optional.empty();
            }
            aligned.add(matched.get(0));
        }
        return Optional.of(List.copyOf(aligned));
    }

    private static Map<String, Object> exactly(int count, Map<String, Object> items) {
        return ordered("type", "array", "minItems", count, "maxItems", count, "items", items);
    }
}
