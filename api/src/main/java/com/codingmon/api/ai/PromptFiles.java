package com.codingmon.api.ai;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

// src/main/resources/prompts/ 아래의 프롬프트 파일을 읽는다. 프롬프트 클래스는 생성자에서 읽으므로 파일이 하나라도 없으면
// 서버가 뜨지 않는다. 호출할 때 처음 알게 되면 그 기능만 계속 실패한다.
final class PromptFiles {

    private PromptFiles() {
    }

    // path는 "prompts/code-review-v1/system.md" 꼴이다.
    static String read(String path) {
        try (InputStream in = PromptFiles.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("프롬프트 파일이 없다: " + path);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("프롬프트 파일을 읽지 못했다: " + path, e);
        }
    }
}
