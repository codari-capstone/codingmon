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

// 판정별 오답 샘플(AnalysisSamples)을 실제 모델에 보내 프롬프트 v1을 평가한다(#76). LLM_URL과 LLM_MODEL이 없으면 건너뛴다.
// 응답 원문과 걸린 시간은 build/analysis-eval/에 남긴다. 사람이 읽고 힌트 단계·말투를 평가하는 데 쓴다.
// 여기서 보는 것은 스키마, 줄 번호 범위, 코드 블록과 정답 코드 조각이다. 서버의 정답 코드 검사는 AnswerGuard(#78)가 한다.
// 서버의 사실 검증(FactCheck, #79)이 이 응답을 어떻게 고치는지는 summary.tsv 끝 칸에 남긴다(비공개 원문 없이 돌린다).
// 정상 응답의 [사실]이 많이 옮겨지면 규칙이 너무 좁은 것이다.
@EnabledIfEnvironmentVariable(named = "LLM_URL", matches = ".+")
@EnabledIfEnvironmentVariable(named = "LLM_MODEL", matches = ".+")
class AnalysisPromptIntegrationTest {

    private static final Path OUT = Path.of("build", "analysis-eval");
    private static final AnalysisPrompt PROMPT = new AnalysisPrompt("v1");
    private static final OpenAiCompatibleLlmClient CLIENT = new OpenAiCompatibleLlmClient(System.getenv("LLM_URL"),
            System.getenv().getOrDefault("LLM_API_KEY", ""), System.getenv("LLM_MODEL"), "v1", "v1",
            Duration.ofSeconds(3), Duration.ofSeconds(180), 8192, JsonMapper.builder().build(),
            Validation.buildDefaultValidatorFactory().getValidator());
    private static final List<String> SUMMARY = new ArrayList<>();

    static Stream<AnalysisSamples.Case> samples() {
        return AnalysisSamples.all().stream();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("samples")
    void 판정별_샘플에_스키마대로_답하고_코드를_흘리지_않는다(AnalysisSamples.Case sample) throws IOException {
        long started = System.nanoTime();
        LlmResponse<AnalysisResult> response = CLIENT.complete(PROMPT.request(sample.input()));
        long millis = (System.nanoTime() - started) / 1_000_000;
        AnalysisResult result = response.value();
        Files.createDirectories(OUT);
        Files.writeString(OUT.resolve(sample.name().replaceAll("[^0-9A-Za-z가-힣]+", "_") + ".json"), response.json());
        FactCheck.Outcome<AnalysisResult> checked = FactCheck.verify(result,
                FactCheck.Context.of(sample.input(), FactCheck.Sources.NONE));
        synchronized (SUMMARY) {
            SUMMARY.add(sample.name() + "\t" + millis + "ms\t" + response.usage() + "\t" + checked.label() + " "
                    + FactCheck.describe(checked.fixes()));
        }

        int lines = sample.input().submission().codeLines();
        assertThat(result.suspectLines()).allSatisfy(line -> assertThat(line).isBetween(1, lines));
        String text = String.join("\n", texts(result));
        assertThat(text).doesNotContain("```");
        assertThat(text.lines()).noneMatch(line -> line.startsWith("    ") || line.startsWith("\t"));
        assertThat(sample.forbidden()).allSatisfy(forbidden -> assertThat(text).doesNotContain(forbidden));
        assertThat(text).doesNotContainPattern("\\d+\\s*번째\\s*비공개");
        // 화면은 글을 그대로 보여 주므로 마크다운·LaTeX와 입력 JSON의 영어 값 이름을 쓰지 않는다.
        assertThat(text).doesNotContain("`", "$");
        assertThat(text).doesNotContainPattern("\\b(WRONG_ANSWER|TIME_LIMIT_EXCEEDED|MEMORY_LIMIT_EXCEEDED|RUNTIME_ERROR"
                + "|COMPILE_ERROR|PRESENTATION_ERROR|OUTPUT_LIMIT_EXCEEDED|INDEX_ERROR|SMALL|MEDIUM|LARGE)\\b");
        // 꼬리표는 화면이 붙인다.
        assertThat(result.facts()).noneMatch(item -> item.startsWith("["));
        assertThat(result.guesses()).noneMatch(item -> item.startsWith("["));
        // 한자·일본 글자·키릴·태국 글자가 섞이지 않는다.
        assertThat(text).doesNotContainPattern("[\\p{IsHan}\\p{IsHiragana}\\p{IsKatakana}\\p{IsCyrillic}\\p{IsThai}]");
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

    private static List<String> texts(AnalysisResult result) {
        List<String> texts = new ArrayList<>();
        texts.add(result.summary());
        texts.addAll(result.facts());
        texts.addAll(result.guesses());
        texts.add(result.hints().observation());
        texts.add(result.hints().direction());
        texts.add(result.hints().principle());
        return texts;
    }
}
