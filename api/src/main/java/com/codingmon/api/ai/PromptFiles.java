package com.codingmon.api.ai;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;

// src/main/resources/prompts/ 아래의 프롬프트 파일을 읽는다. 프롬프트 클래스는 생성자에서 읽으므로 파일이 하나라도 없으면
// 서버가 뜨지 않는다. 호출할 때 처음 알게 되면 그 기능만 계속 실패한다. AnalysisPrompt와 CodeReviewPrompt가 같이 쓴다.
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

    // 정답 코드 검사(#78)에 걸려 한 번 다시 만들 때의 시스템 지시. 처음 지시 뒤에 retry.md를 붙이고 {{violations}}에 어긴 규칙을
    // 한 줄씩 넣는다(같은 규칙은 한 번만). 앞서 만든 응답 글은 다시 보내지 않는다.
    static String withRetry(String system, String retry, List<AnswerGuard.Violation> violations) {
        String broken = violations.stream()
                .map(v -> "- " + v.rule().description + (v.tag() == null ? "" : ": " + v.tag()))
                .distinct()
                .collect(Collectors.joining("\n"));
        return system + "\n" + retry.replace("{{violations}}", broken) + "\n";
    }
}
