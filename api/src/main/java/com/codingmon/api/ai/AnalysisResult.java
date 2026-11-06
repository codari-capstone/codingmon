package com.codingmon.api.ai;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

// AI 오답 분석(F1)과 힌트 3단계(F2)를 한 번에 받는 응답(AI_FEATURES 3·4절). ai_reviews.content에 이 JSON이 저장된다.
// facts는 화면의 [실행 결과], guesses는 [코드 분석]이다(원칙 4). 줄 번호가 코드 범위 안인지와 facts가 실행 결과와
// 맞는지는 #79, 코드·알고리즘명이 섞였는지는 #78에서 서버가 따로 본다.
// 스키마와 아래 제약을 같이 고친다. 스키마는 모델 출력을 제한하고, 제약은 스키마로 못 거는 글자 수를 본다.
record AnalysisResult(
        @NotBlank @Size(max = SUMMARY_MAX_CHARS) String summary,
        @NotNull @Size(max = MAX_ITEMS) List<@NotNull @Positive Integer> suspectLines,
        @NotNull @Size(min = 1, max = MAX_ITEMS) List<@NotBlank @Size(max = ITEM_MAX_CHARS) String> facts,
        @NotNull @Size(max = MAX_ITEMS) List<@NotBlank @Size(max = ITEM_MAX_CHARS) String> guesses,
        @NotNull @Valid Hints hints) {

    static final int MAX_ITEMS = 5;
    static final int SUMMARY_MAX_CHARS = 300;
    static final int ITEM_MAX_CHARS = 400;
    static final int HINT_MAX_CHARS = 600;

    // 1단계 관찰, 2단계 방향, 3단계 원리. 사용자가 연 단계까지만 내려 준다(#77).
    record Hints(
            @NotBlank @Size(max = HINT_MAX_CHARS) String observation,
            @NotBlank @Size(max = HINT_MAX_CHARS) String direction,
            @NotBlank @Size(max = HINT_MAX_CHARS) String principle) {
    }

    static final String SCHEMA_NAME = "analysis";

    private static final Map<String, Object> TEXT = Map.of("type", "string", "minLength", 1);

    static final Map<String, Object> SCHEMA = Map.of(
            "type", "object",
            "additionalProperties", false,
            "required", List.of("summary", "suspectLines", "facts", "guesses", "hints"),
            "properties", Map.of(
                    "summary", TEXT,
                    "suspectLines", Map.of("type", "array", "maxItems", MAX_ITEMS,
                            "items", Map.of("type", "integer", "minimum", 1)),
                    "facts", Map.of("type", "array", "minItems", 1, "maxItems", MAX_ITEMS, "items", TEXT),
                    "guesses", Map.of("type", "array", "maxItems", MAX_ITEMS, "items", TEXT),
                    "hints", Map.of(
                            "type", "object",
                            "additionalProperties", false,
                            "required", List.of("observation", "direction", "principle"),
                            "properties", Map.of("observation", TEXT, "direction", TEXT, "principle", TEXT))));
}
