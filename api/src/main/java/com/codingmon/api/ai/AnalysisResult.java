package com.codingmon.api.ai;

import static com.codingmon.api.ai.JsonSchemas.ordered;
import static com.codingmon.api.ai.JsonSchemas.text;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

// AI 오답 분석(F1)과 힌트 3단계(F2)를 한 번에 받는 응답(AI_FEATURES 3·4절). ai_reviews.content에 이 JSON이 저장된다.
// facts는 화면의 [실행 결과], guesses는 [코드 분석]이다(원칙 4). 코드·알고리즘명이 섞였는지는 AnswerGuard(#78)가,
// 줄 번호가 코드 범위 안인지와 facts가 실행 결과와 맞는지는 FactCheck(#79)가 저장 전에 본다. FactCheck는 근거 없는 facts를
// guesses 뒤로 옮기므로 저장된 값은 facts가 비고 guesses가 MAX_ITEMS를 넘을 수 있다. 아래 제약은 모델 응답에만 건다(읽을 때는 보지 않는다).
// 저장된 JSON에는 검증 내역(factCheck)이 더 있다. 읽을 때 모르는 키는 무시한다(Jackson 3 기본값).
// 스키마와 아래 제약을 같이 고친다. 스키마는 모델 출력을 제한하고, 제약은 스키마로 못 거는 것(공백뿐인 글)만 본다.
// 글자 수 상한은 스키마에만 둔다. 스키마 검사기는 코드 포인트로, @Size는 UTF-16 단위로 세어 이모지 같은 글자가 섞이면
// 스키마는 통과하고 @Size만 어기는데, 재요청도 같은 상한을 받아 같은 이유로 실패한다.
record AnalysisResult(
        @NotBlank String summary,
        @NotNull @Size(max = MAX_ITEMS) List<@NotNull @Positive Integer> suspectLines,
        @NotNull @Size(min = 1, max = MAX_ITEMS) List<@NotBlank String> facts,
        @NotNull @Size(max = MAX_ITEMS) List<@NotBlank String> guesses,
        @NotNull @Valid Hints hints) {

    static final int MAX_ITEMS = 5;
    static final int SUMMARY_MAX_CHARS = 300;
    static final int ITEM_MAX_CHARS = 400;
    static final int HINT_MAX_CHARS = 600;

    // 1단계 관찰, 2단계 방향, 3단계 원리. 사용자가 연 단계까지만 내려 준다(#77).
    record Hints(
            @NotBlank String observation,
            @NotBlank String direction,
            @NotBlank String principle) {
    }

    static final String SCHEMA_NAME = "analysis";

    // 키 순서를 고정한다(JsonSchemas). 원인·사실을 먼저 쓰고 힌트를 마지막에 쓰게 한다.
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
}
