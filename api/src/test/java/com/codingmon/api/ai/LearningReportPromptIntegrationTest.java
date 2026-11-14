package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import jakarta.validation.Validation;
import tools.jackson.databind.json.JsonMapper;

// 더미 통계 3세트(LearningReportSamples)를 실제 모델에 보내 학습 리포트 프롬프트 v1을 평가한다(#84). LLM_URL과 LLM_MODEL이 없으면 건너뛴다.
// 세트마다 LLM_EVAL_RUNS번(기본 1) 부른다. 응답 원문은 build/learning-report-eval/에 남긴다. 사람이 읽고 입문자가 이해할 문장인지,
// 연습 방법이 구체적인지, 추천 이유가 문제와 개념을 잇는지 평가하는 데 쓴다.
// summary.tsv에는 걸린 시간, 토큰과 함께 입력에 없는 수치(#85 대조의 시안)와 글 하나의 최대 수치 개수를 적는다. 여기서는 막지 않고 세기만 한다.
// 여기서 막는 것은 스키마와 순서(alignedTo), 표기 규칙(마크다운·다른 나라 글자·영어 키 이름·코드)이다.
@EnabledIfEnvironmentVariable(named = "LLM_URL", matches = ".+")
@EnabledIfEnvironmentVariable(named = "LLM_MODEL", matches = ".+")
class LearningReportPromptIntegrationTest {

    private static final Path OUT = Path.of("build", "learning-report-eval");
    private static final LearningReportPrompt PROMPT = new LearningReportPrompt("v1");
    private static final OpenAiCompatibleLlmClient CLIENT = new OpenAiCompatibleLlmClient(System.getenv("LLM_URL"),
            System.getenv().getOrDefault("LLM_API_KEY", ""), System.getenv("LLM_MODEL"), "v1", "v1", "v1",
            Duration.ofSeconds(3), Duration.ofSeconds(180), 8192, JsonMapper.builder().build(),
            Validation.buildDefaultValidatorFactory().getValidator());
    private static final int RUNS = Integer.parseInt(System.getenv().getOrDefault("LLM_EVAL_RUNS", "1"));
    private static final List<String> SUMMARY = new ArrayList<>();
    // 수(천 단위 쉼표, 소수 포함). 한글 수사("두세 문장")는 수치로 보지 않는다.
    private static final Pattern NUMBER = Pattern.compile("\\d+(?:,\\d{3})*(?:\\.\\d+)?");

    static Stream<Arguments> samples() {
        return LearningReportSamples.all().stream()
                .flatMap(sample -> IntStream.rangeClosed(1, RUNS).mapToObj(run -> Arguments.of(sample, run)));
    }

    @ParameterizedTest(name = "{0} #{1}")
    @MethodSource("samples")
    void 통계를_바꾸지_않고_스키마대로_답한다(LearningReportSamples.Case sample, int run) throws IOException {
        LearningReportInput input = sample.input();
        long started = System.nanoTime();
        LlmResponse<LearningReportResult> response = CLIENT.complete(PROMPT.request(input));
        long millis = (System.nanoTime() - started) / 1_000_000;
        Files.createDirectories(OUT);
        Files.writeString(OUT.resolve(sample.name().replaceAll("[^0-9A-Za-z가-힣]+", "_") + "_" + run + ".json"),
                response.json());
        LearningReportResult result = response.value();
        List<String> texts = texts(result);
        Set<String> unknown = unknownNumbers(input, texts);
        int mostNumbers = texts.stream().mapToInt(text -> numbers(text).size()).max().orElse(0);
        synchronized (SUMMARY) {
            SUMMARY.add(sample.name() + "\t" + run + "\t" + millis + "ms\t" + response.usage() + "\taligned="
                    + result.alignedTo(input).isPresent() + "\tunknownNumbers=" + (unknown.isEmpty() ? "-" : unknown)
                    + "\tmostNumbersPerText=" + mostNumbers);
        }

        // 스키마가 개수와 이름·순위를 묶는다. 순서까지 맞는지 본다(어긋나도 서버가 맞추지만 지시를 따랐는지 본다).
        assertThat(result.weakConcepts()).extracting(LearningReportResult.WeakConcept::concept)
                .containsExactlyElementsOf(input.weakConceptNames());
        assertThat(result.recommendations()).extracting(LearningReportResult.RecommendationReason::rank)
                .containsExactlyElementsOf(input.recommendationRanks());
        String text = String.join("\n", texts);
        // 화면은 글을 그대로 보여 주므로 마크다운·LaTeX와 코드를 쓰지 않는다.
        assertThat(text).doesNotContain("```", "`", "$", "**");
        assertThat(text.lines()).noneMatch(line -> line.matches("\\s*[-*•]\\s.*"));
        // 한자·일본 글자·키릴·태국 글자가 섞이지 않는다.
        assertThat(text).doesNotContainPattern("[\\p{IsHan}\\p{IsHiragana}\\p{IsKatakana}\\p{IsCyrillic}\\p{IsThai}]");
        // 입력 JSON의 영어 키와 값 이름을 옮기지 않는다.
        assertThat(text).doesNotContainPattern(
                "\\b(solveRate|averageAttempts|averageHintLevel|problemCount|solvedCount|weak|attempted|nextConcepts|EASY|MEDIUM|HARD)\\b");
        // 취약 점수는 입력에 없다.
        assertThat(text).doesNotContain("취약 점수");
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

    // 입력 JSON에 나온 수(통계 표기, 개수, 순위, 제목·이유 속의 수)와 힌트 단계의 범위(0~3)만 쓸 수 있다.
    private static Set<String> unknownNumbers(LearningReportInput input, List<String> texts) {
        Set<String> allowed = new LinkedHashSet<>(numbers(input.toJson()));
        allowed.addAll(List.of("0", "1", "2", "3"));
        Set<String> unknown = new LinkedHashSet<>();
        texts.forEach(text -> numbers(text).stream().filter(n -> !allowed.contains(n)).forEach(unknown::add));
        return unknown;
    }

    private static List<String> numbers(String text) {
        List<String> found = new ArrayList<>();
        Matcher matcher = NUMBER.matcher(text);
        while (matcher.find()) {
            found.add(matcher.group().replace(",", ""));
        }
        return found;
    }

    private static List<String> texts(LearningReportResult result) {
        List<String> texts = new ArrayList<>();
        result.weakConcepts().forEach(concept -> texts.addAll(List.of(concept.explanation(), concept.practice())));
        result.recommendations().forEach(reason -> texts.add(reason.reason()));
        texts.add(result.summary());
        return texts;
    }
}
