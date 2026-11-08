package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import jakarta.validation.Validation;
import tools.jackson.databind.json.JsonMapper;

// 정답 제출 샘플(CodeReviewSamples)을 실제 모델에 보내 코드 리뷰 프롬프트 v1을 평가한다(#82). LLM_URL과 LLM_MODEL이 없으면 건너뛴다.
// 응답 원문과 걸린 시간은 build/code-review-eval/에 남긴다. 사람이 읽고 복잡도 추정, 개선점, 다음 개념을 평가하는 데 쓴다.
// summary.tsv에는 샘플마다 기대한 meetsIntended와 모델의 값을 나란히 적는다(기대값이 null이면 어느 쪽도 될 수 있다).
// 여기서 보는 것은 스키마, 코드 블록·금지 글, 표기 규칙이다. 서버의 정답 코드 검사(AnswerGuard)는 따로 붙는다.
@EnabledIfEnvironmentVariable(named = "LLM_URL", matches = ".+")
@EnabledIfEnvironmentVariable(named = "LLM_MODEL", matches = ".+")
class CodeReviewPromptIntegrationTest {

    private static final Path OUT = Path.of("build", "code-review-eval");
    private static final CodeReviewPrompt PROMPT = new CodeReviewPrompt("v1");
    private static final OpenAiCompatibleLlmClient CLIENT = new OpenAiCompatibleLlmClient(System.getenv("LLM_URL"),
            System.getenv().getOrDefault("LLM_API_KEY", ""), System.getenv("LLM_MODEL"), "v1", "v1",
            Duration.ofSeconds(3), Duration.ofSeconds(180), 4096, JsonMapper.builder().build(),
            Validation.buildDefaultValidatorFactory().getValidator());
    private static final List<String> SUMMARY = new ArrayList<>();

    static Stream<CodeReviewSamples.Case> samples() {
        return CodeReviewSamples.all().stream();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("samples")
    void 정답_샘플에_스키마대로_답하고_코드를_쓰지_않는다(CodeReviewSamples.Case sample) throws IOException {
        long started = System.nanoTime();
        LlmResponse<CodeReviewResult> response = CLIENT.complete(PROMPT.request(sample.input()));
        long millis = (System.nanoTime() - started) / 1_000_000;
        CodeReviewResult result = response.value();
        Files.createDirectories(OUT);
        Files.writeString(OUT.resolve(sample.name().replaceAll("[^0-9A-Za-z가-힣]+", "_") + ".json"), response.json());
        synchronized (SUMMARY) {
            SUMMARY.add(sample.name() + "\t" + millis + "ms\t" + response.usage() + "\ttime=" + result.complexity().time()
                    + "\tintended=" + result.complexity().intendedTime() + "\tmeetsIntended=" + result.complexity().meetsIntended()
                    + "\texpected=" + sample.meetsIntended());
        }

        String text = String.join("\n", texts(result));
        assertThat(text).doesNotContain("```");
        assertThat(text.lines()).noneMatch(line -> line.startsWith("    ") || line.startsWith("\t"));
        assertThat(sample.forbidden()).allSatisfy(forbidden -> assertThat(text).doesNotContain(forbidden));
        // 화면은 글을 그대로 보여 주므로 마크다운·LaTeX와 입력 JSON의 영어 값 이름을 쓰지 않는다.
        assertThat(text).doesNotContain("`", "$");
        assertThat(text).doesNotContainPattern("\\b(PYTHON|CPP|ACCEPTED)\\b");
        // 한자·일본 글자·키릴·태국 글자가 섞이지 않는다.
        assertThat(text).doesNotContainPattern("[\\p{IsHan}\\p{IsHiragana}\\p{IsKatakana}\\p{IsCyrillic}\\p{IsThai}]");
        // 식은 일반 글자로 쓴다(곱셈은 ×).
        assertThat(text).doesNotContainPattern("\\w\\s?\\*\\s?[\\w(]|\\*\\*|\\s//\\s");
        // 다음 개념은 함수·라이브러리 이름이 아니라 개념 이름이다(#83이 개념 태그와 맞춘다).
        assertThat(result.nextConcepts()).extracting(CodeReviewResult.Concept::name)
                .noneMatch(name -> name.matches(".*[A-Za-z_]\\w*\\.[A-Za-z_].*|.*\\(.*|.*[A-Za-z_]\\w*\\s*(함수|메서드).*"));
        // 복잡도는 O 표기만 쓴다.
        assertThat(List.of(result.complexity().time(), result.complexity().space(), result.complexity().intendedTime()))
                .allSatisfy(notation -> assertThat(notation.strip()).matches("O\\(.+\\)"));
    }

    @AfterAll
    static void writeSummary() {
        try {
            Files.createDirectories(OUT);
            Files.write(OUT.resolve("summary.tsv"), SUMMARY);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static List<String> texts(CodeReviewResult result) {
        List<String> texts = new ArrayList<>();
        texts.add(result.summary());
        CodeReviewResult.Complexity complexity = result.complexity();
        texts.addAll(List.of(complexity.basis(), complexity.time(), complexity.space(), complexity.intendedTime(),
                complexity.comparison()));
        texts.addAll(result.improvements());
        result.nextConcepts().forEach(concept -> texts.addAll(List.of(concept.name(), concept.reason())));
        return texts;
    }
}
