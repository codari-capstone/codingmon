package com.codingmon.api.ai;

import java.util.Collections;
import java.util.LinkedHashMap;
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
// 스키마와 아래 제약을 같이 고친다. 스키마는 모델 출력을 제한하고, 제약은 Jackson으로 옮긴 값을 한 번 더 본다(공백뿐인 글 등).
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

    // 키 순서를 고정한다. Map.of는 JVM을 띄울 때마다 순서가 달라지는데, llama.cpp·Ollama는 properties 순서대로
    // 출력하게 문법을 만들어 같은 버전에서도 출력 순서와 품질이 흔들린다. 원인·사실을 먼저 쓰고 힌트를 마지막에 쓰게 한다.
    static final Map<String, Object> SCHEMA = ordered(
            "type", "object",
            "additionalProperties", false,
            "required", List.of("summary", "suspectLines", "facts", "guesses", "hints"),
            "properties", ordered(
                    "summary", text(SUMMARY_MAX_CHARS),
                    "suspectLines", ordered("type", "array", "maxItems", MAX_ITEMS,
                            "items", ordered("type", "integer", "minimum", 1)),
                    "facts", ordered("type", "array", "minItems", 1, "maxItems", MAX_ITEMS, "items", text(ITEM_MAX_CHARS)),
                    "guesses", ordered("type", "array", "maxItems", MAX_ITEMS, "items", text(ITEM_MAX_CHARS)),
                    "hints", ordered(
                            "type", "object",
                            "additionalProperties", false,
                            "required", List.of("observation", "direction", "principle"),
                            "properties", ordered("observation", text(HINT_MAX_CHARS), "direction", text(HINT_MAX_CHARS),
                                    "principle", text(HINT_MAX_CHARS)))));

    // 글자 수 상한을 스키마에도 둔다. 모델이 상한을 모르면 넘긴 응답을 재요청해도 같은 이유로 실패한다.
    private static Map<String, Object> text(int maxChars) {
        return ordered("type", "string", "minLength", 1, "maxLength", maxChars);
    }

    private static Map<String, Object> ordered(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return Collections.unmodifiableMap(map);
    }
}
