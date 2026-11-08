package com.codingmon.api.ai;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

// 모델 응답을 제한하는 JSON 스키마를 만드는 도구. AnalysisResult와 CodeReviewResult가 같이 쓴다.
// 키 순서를 고정한다. Map.of는 JVM을 띄울 때마다 순서가 달라지는데, llama.cpp·Ollama는 properties 순서대로
// 출력하게 문법을 만들어 같은 버전에서도 출력 순서와 품질이 흔들린다.
final class JsonSchemas {

    private JsonSchemas() {
    }

    // 글자 수 상한을 스키마에도 둔다. 모델이 상한을 모르면 넘긴 응답을 재요청해도 같은 이유로 실패한다.
    static Map<String, Object> text(int maxChars) {
        return ordered("type", "string", "minLength", 1, "maxLength", maxChars);
    }

    static Map<String, Object> ordered(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return Collections.unmodifiableMap(map);
    }
}
