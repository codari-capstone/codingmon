package com.codingmon.api.ai;

import static com.codingmon.api.ai.JsonSchemas.ordered;
import static com.codingmon.api.ai.JsonSchemas.text;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

// AI 코드 리뷰(F3) 응답(AI_FEATURES 6절). 정답 제출만 리뷰하고, ai_reviews.content(review_type = CODE_REVIEW)에 이 JSON이 저장된다.
// 고친 코드는 쓰지 않고 방향을 말로만 설명한다. 코드·정답 코드 조각이 섞였는지는 서버가 따로 본다(AnswerGuard, #78).
// 문제가 의도한 복잡도(intendedTime)는 문제에 적힌 값이 없어 모델이 제약·시간 제한·개념 태그로 어림한 추정이다.
// 스키마와 아래 제약을 같이 고친다. 글자 수 상한은 AnalysisResult와 같은 이유로 스키마에만 둔다.
record CodeReviewResult(
        @NotBlank String summary,
        @NotNull @Valid Complexity complexity,
        @NotNull @Size(max = MAX_IMPROVEMENTS) List<@NotBlank String> improvements,
        @NotNull @Size(min = 1, max = MAX_CONCEPTS) List<@NotNull @Valid Concept> nextConcepts) {

    static final int MAX_IMPROVEMENTS = 5;
    static final int MAX_CONCEPTS = 3;
    static final int SUMMARY_MAX_CHARS = 300;
    static final int BASIS_MAX_CHARS = 600;
    // "O(n log n)" 같은 표기
    static final int NOTATION_MAX_CHARS = 40;
    static final int COMPARISON_MAX_CHARS = 400;
    static final int IMPROVEMENT_MAX_CHARS = 400;
    static final int CONCEPT_NAME_MAX_CHARS = 40;
    static final int CONCEPT_REASON_MAX_CHARS = 300;

    // meetsIntended는 time이 intendedTime과 같거나 더 좋으면 true다. 스키마가 있는지 보므로 기본형으로 받는다.
    record Complexity(
            @NotBlank String basis,
            @NotBlank String time,
            @NotBlank String space,
            @NotBlank String intendedTime,
            @NotBlank String comparison,
            boolean meetsIntended) {
    }

    // name은 짧은 개념 이름이다. 개념 태그(concept_tags)와 맞추는 것은 #83이 한다.
    record Concept(
            @NotBlank String name,
            @NotBlank String reason) {
    }

    static final String SCHEMA_NAME = "code_review";

    // 키 순서를 고정한다(JsonSchemas). 복잡도는 근거(basis)를 먼저 쓰고 결론(time·space·meetsIntended)을 뒤에 쓰게 한다.
    static final Map<String, Object> SCHEMA = ordered(
            "type", "object",
            "additionalProperties", false,
            "required", List.of("summary", "complexity", "improvements", "nextConcepts"),
            "properties", ordered(
                    "summary", text(SUMMARY_MAX_CHARS),
                    "complexity", ordered(
                            "type", "object",
                            "additionalProperties", false,
                            "required", List.of("basis", "time", "space", "intendedTime", "comparison", "meetsIntended"),
                            "properties", ordered(
                                    "basis", text(BASIS_MAX_CHARS),
                                    "time", text(NOTATION_MAX_CHARS),
                                    "space", text(NOTATION_MAX_CHARS),
                                    "intendedTime", text(NOTATION_MAX_CHARS),
                                    "comparison", text(COMPARISON_MAX_CHARS),
                                    "meetsIntended", ordered("type", "boolean"))),
                    "improvements", ordered("type", "array", "maxItems", MAX_IMPROVEMENTS,
                            "items", text(IMPROVEMENT_MAX_CHARS)),
                    "nextConcepts", ordered("type", "array", "minItems", 1, "maxItems", MAX_CONCEPTS,
                            "items", ordered(
                                    "type", "object",
                                    "additionalProperties", false,
                                    "required", List.of("name", "reason"),
                                    "properties", ordered("name", text(CONCEPT_NAME_MAX_CHARS),
                                            "reason", text(CONCEPT_REASON_MAX_CHARS))))));
}
