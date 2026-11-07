package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import com.codingmon.api.Language;
import com.codingmon.api.ai.AnalysisInput.Problem;
import com.codingmon.api.ai.AnalysisInput.Submission;
import com.codingmon.api.judge.Verdict;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class AnalysisPromptTest {

    private static final AnalysisPrompt PROMPT = new AnalysisPrompt("v1");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();
    private static final Schema SCHEMA = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12)
            .getSchema(JSON.<JsonNode>valueToTree(AnalysisResult.SCHEMA));

    // AI_FEATURES 5절 예시를 응답 꼴로 옮긴 것
    private static final String PYRAMID_ANSWER = """
            {"summary":"별 개수가 줄마다 줄어야 하는데 늘어나고 있어요.",
             "suspectLines":[4,5],
             "facts":["공개 예제 1에서 기대 출력은 줄마다 별이 5개, 3개, 1개로 줄어드는데, 제출 코드의 출력은 1개, 3개, 5개로 늘어납니다."],
             "guesses":["4번째 줄의 반복과 별 개수 식이 정방향 기준으로 작성된 것 같습니다."],
             "hints":{"observation":"예제 출력의 첫 줄과 마지막 줄 별 개수를 세어 보세요. 내 출력과 순서가 어떻게 다른가요?",
                      "direction":"줄 번호 i가 커질 때 별 개수가 어떻게 변해야 하는지 식으로 적어 보세요.",
                      "principle":"정방향 별 개수 2i − 1에서 i 자리에 n − i + 1을 넣으면 별은 2(n − i) + 1개, 앞 공백은 i − 1개가 됩니다."}}
            """;

    @ParameterizedTest
    @EnumSource(value = Verdict.class, names = "ACCEPTED", mode = EnumSource.Mode.EXCLUDE)
    void 오답_판정마다_공통_지시_뒤에_그_판정의_지시를_붙인다(Verdict verdict) {
        LlmRequest<AnalysisResult> request = PROMPT.request(input(verdict));

        assertThat(request.system()).startsWith("너는 프로그래밍을 처음 배우는 학습자를 돕는 채점 도우미다.");
        assertThat(request.system()).contains("# 판정별 지시");
        String heading = request.system().substring(request.system().indexOf("# 판정별 지시"));
        assertThat(heading).containsPattern("\n## \\S");
        // 다른 판정의 지시는 섞이지 않는다.
        long verdictHeadings = request.system().lines().filter(line -> line.startsWith("## ")).count();
        assertThat(verdictHeadings).isOne();
        assertThat(request.schemaName()).isEqualTo("analysis");
        assertThat(request.schema()).isSameAs(AnalysisResult.SCHEMA);
        assertThat(request.responseType()).isEqualTo(AnalysisResult.class);
    }

    @Test
    void 판정마다_다른_지시를_쓴다() {
        List<String> systems = Arrays.stream(Verdict.values()).filter(v -> v != Verdict.ACCEPTED)
                .map(v -> PROMPT.request(input(v)).system()).toList();

        assertThat(systems).doesNotHaveDuplicates();
        assertThat(PROMPT.request(input(Verdict.COMPILE_ERROR)).system()).contains("## 컴파일 에러", "compilerMessage");
        assertThat(PROMPT.request(input(Verdict.TIME_LIMIT_EXCEEDED)).system()).contains("## 시간 초과");
    }

    @Test
    void 지시에_정답_코드와_비공개_테스트_금지가_들어_있다() {
        String system = PROMPT.request(input(Verdict.WRONG_ANSWER)).system();

        assertThat(system).contains("코드를 쓰지 않는다", "코드 블록", "비공개 테스트의 입력값과 기대 출력을 말하거나 지어내지 않는다",
                "식과 말로", "[실행 결과]", "[코드 분석]");
    }

    @Test
    void 사용자_메시지는_분석_입력_JSON이다() {
        AnalysisInput input = AnalysisSamples.reversePyramid().input();

        assertThat(PROMPT.request(input).user()).isEqualTo(input.toJson());
    }

    @Test
    void 맞은_제출은_분석하지_않는다() {
        assertThatThrownBy(() -> PROMPT.request(input(Verdict.ACCEPTED))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 없는_버전이면_만들_때_실패한다() {
        assertThatThrownBy(() -> new AnalysisPrompt("v999"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("prompts/analysis-v999/system.md");
    }

    @Test
    void 문서의_예시_응답은_스키마와_제약을_지킨다() {
        JsonNode tree = JSON.readTree(PYRAMID_ANSWER);

        assertThat(SCHEMA.validate(tree)).isEmpty();
        AnalysisResult result = JSON.treeToValue(tree, AnalysisResult.class);
        assertThat(VALIDATOR.validate(result)).isEmpty();
        assertThat(result.suspectLines()).containsExactly(4, 5);
        assertThat(result.hints().principle()).contains("2(n − i) + 1");
    }

    @Test
    void 빠진_항목이나_없는_항목이_있으면_스키마를_어긴다() {
        assertThat(SCHEMA.validate(JSON.readTree(PYRAMID_ANSWER.replace("\"guesses\"", "\"guess\"")))).isNotEmpty();
        assertThat(SCHEMA.validate(JSON.readTree(PYRAMID_ANSWER.replace("\"principle\"", "\"code\"")))).isNotEmpty();
        assertThat(SCHEMA.validate(JSON.readTree(PYRAMID_ANSWER.replace("[4,5]", "[0]")))).isNotEmpty();
        assertThat(SCHEMA.validate(JSON.readTree(PYRAMID_ANSWER.replace("[4,5]", "[1,2,3,4,5,6]")))).isNotEmpty();
        assertThat(SCHEMA.validate(JSON.readTree(
                PYRAMID_ANSWER.replaceFirst("\"facts\":\\[[^]]*]", "\"facts\":[]")))).isNotEmpty();
    }

    @Test
    void 스키마로_못_거는_빈_글은_제약이_거른다() {
        AnalysisResult blank = JSON.readValue(PYRAMID_ANSWER.replace("\"별 개수가 줄마다 줄어야 하는데 늘어나고 있어요.\"", "\" \""),
                AnalysisResult.class);

        assertThat(VALIDATOR.validate(blank)).extracting(v -> v.getPropertyPath().toString()).containsExactly("summary");
    }

    @Test
    void 글자_수는_스키마와_제약이_같은_기준으로_센다() {
        // 이모지는 UTF-16으로 두 칸이다. 스키마(코드 포인트)를 통과한 글을 제약이 다시 막으면 재요청도 같은 이유로 실패한다.
        String emojiHint = PYRAMID_ANSWER.replace("세어 보세요.", "😀".repeat(AnalysisResult.HINT_MAX_CHARS - 100));

        assertThat(SCHEMA.validate(JSON.readTree(emojiHint))).isEmpty();
        assertThat(VALIDATOR.validate(JSON.readValue(emojiHint, AnalysisResult.class))).isEmpty();
    }

    @Test
    void 스키마의_키_순서는_고정이다() {
        // 모델은 properties 순서대로 쓴다. 원인과 사실을 먼저, 힌트를 마지막에 쓰게 한다.
        String json = JSON.writeValueAsString(AnalysisResult.SCHEMA);

        assertThat(json).containsSubsequence("\"summary\"", "\"suspectLines\"", "\"facts\"", "\"guesses\"", "\"hints\"",
                "\"observation\"", "\"direction\"", "\"principle\"");
        assertThat(json.indexOf("\"properties\"")).isGreaterThan(json.indexOf("\"required\""));
    }

    @Test
    void 글자_수_상한은_스키마에도_있다() {
        String tooLong = PYRAMID_ANSWER.replace("세어 보세요.", "가".repeat(AnalysisResult.HINT_MAX_CHARS));

        assertThat(SCHEMA.validate(JSON.readTree(tooLong))).isNotEmpty();
        assertThat(SCHEMA.validate(JSON.readTree(PYRAMID_ANSWER.replace("별 개수가 줄마다 줄어야 하는데 늘어나고 있어요.",
                "가".repeat(AnalysisResult.SUMMARY_MAX_CHARS + 1))))).isNotEmpty();
    }

    @Test
    void 버전은_LLM_클라이언트에서_받는다() {
        LlmClient llm = mock(LlmClient.class);
        when(llm.promptVersion(ReviewType.ANALYSIS)).thenReturn("v999");

        assertThatThrownBy(() -> new AnalysisPrompt(llm)).hasMessageContaining("prompts/analysis-v999/");
    }

    @Test
    void 샘플마다_요청을_만들_수_있다() {
        assertThat(AnalysisSamples.all()).hasSizeGreaterThanOrEqualTo(5)
                .allSatisfy(c -> assertThat(PROMPT.request(c.input()).user()).isEqualTo(c.input().toJson()));
        assertThat(AnalysisSamples.all()).extracting(c -> c.input().submission().verdict())
                .contains(Verdict.COMPILE_ERROR, Verdict.RUNTIME_ERROR, Verdict.TIME_LIMIT_EXCEEDED,
                        Verdict.MEMORY_LIMIT_EXCEEDED, Verdict.WRONG_ANSWER, Verdict.PRESENTATION_ERROR,
                        Verdict.OUTPUT_LIMIT_EXCEEDED);
    }

    private static AnalysisInput input(Verdict verdict) {
        return new AnalysisInput(
                Problem.of("두 수의 합", "A+B를 출력하세요.", "A와 B", "A+B", "0 < A, B < 10", 1000, 128, List.of("입출력")),
                Submission.of(Language.PYTHON, verdict, null, 10, 9000, "print(1)\n", null), null, null);
    }
}
