package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

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

class CodeReviewPromptTest {

    private static final CodeReviewPrompt PROMPT = new CodeReviewPrompt("v1");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();
    private static final Schema SCHEMA = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12)
            .getSchema(JSON.<JsonNode>valueToTree(CodeReviewResult.SCHEMA));

    // CodeReviewSamples.squareSum()에 대한 응답 예시
    private static final String SQUARE_SUM_ANSWER = """
            {"summary":"1부터 n까지 돌면서 제곱을 더하는 방식으로 정확하게 풀었어요. 반복 없이 식 하나로 구하는 방법도 있어요.",
             "complexity":{"basis":"3번 줄의 반복이 1부터 n까지 n번 돌고, 4번 줄의 곱셈과 덧셈은 한 번에 끝납니다. 저장하는 값은 n, total, i뿐이에요.",
                           "time":"O(n)",
                           "space":"O(1)",
                           "intendedTime":"O(1)",
                           "comparison":"n ≤ 1,000,000이면 약 100만 번 반복해 시간 안에 들어옵니다. 다만 1부터 n까지 제곱의 합은 n × (n + 1) × (2n + 1) / 6으로 바로 구할 수 있어, 문제가 의도한 복잡도는 O(1)로 추정돼요.",
                           "meetsIntended":false},
             "improvements":["4번 줄은 total에 값을 더해 다시 넣는데, 더해서 넣는 복합 대입 연산자를 쓰면 더 짧게 읽힙니다.",
                             "변수 total은 무엇의 합인지 드러나도록 제곱의 합이라는 뜻을 담은 이름으로 지으면 읽기 쉬워요."],
             "nextConcepts":[{"name":"수열의 합 공식","reason":"규칙적으로 늘어나는 수의 합을 반복 없이 식 하나로 구할 수 있어, 3번 줄의 반복을 없앨 수 있어요."}]}
            """;

    @Test
    void 시스템_지시와_스키마로_요청을_만든다() {
        LlmRequest<CodeReviewResult> request = PROMPT.request(CodeReviewSamples.squareSum().input());

        assertThat(request.system()).startsWith("너는 프로그래밍을 처음 배우는 학습자의 코드를 리뷰하는 도우미다.");
        assertThat(request.schemaName()).isEqualTo("code_review");
        assertThat(request.schema()).isSameAs(CodeReviewResult.SCHEMA);
        assertThat(request.responseType()).isEqualTo(CodeReviewResult.class);
    }

    @Test
    void 지시에_코드_금지와_복잡도_추정_규칙이_들어_있다() {
        String system = PROMPT.request(CodeReviewSamples.squareSum().input()).system();

        assertThat(system).contains("코드를 쓰지 않는다", "코드 블록", "괄호 없이 이름만", "O 표기", "어림한다", "추정이라고 밝힌다",
                "측정값만 보고 복잡도를 정하지 않는다", "가장 빠른 방법이라는 뜻은 아니다",
                "비공개 테스트의 입력값과 기대 출력을 말하거나 지어내지 않는다");
    }

    @Test
    void 사용자_메시지는_리뷰_입력_JSON이다() {
        CodeReviewInput input = CodeReviewSamples.sortScores().input();

        assertThat(PROMPT.request(input).user()).isEqualTo(input.toJson());
    }

    @ParameterizedTest
    @EnumSource(value = Verdict.class, names = "ACCEPTED", mode = EnumSource.Mode.EXCLUDE)
    void 정답이_아닌_제출은_리뷰하지_않는다(Verdict verdict) {
        assertThatThrownBy(() -> PROMPT.request(input(verdict))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 없는_버전이면_만들_때_실패한다() {
        assertThatThrownBy(() -> new CodeReviewPrompt("v999"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("prompts/code-review-v999/system.md");
    }

    @Test
    void 버전은_LLM_클라이언트에서_받는다() {
        LlmClient llm = mock(LlmClient.class);
        when(llm.promptVersion(ReviewType.CODE_REVIEW)).thenReturn("v999");

        assertThatThrownBy(() -> new CodeReviewPrompt(llm)).hasMessageContaining("prompts/code-review-v999/");
    }

    @Test
    void 예시_응답은_스키마와_제약을_지킨다() {
        JsonNode tree = JSON.readTree(SQUARE_SUM_ANSWER);

        assertThat(SCHEMA.validate(tree)).isEmpty();
        CodeReviewResult result = JSON.treeToValue(tree, CodeReviewResult.class);
        assertThat(VALIDATOR.validate(result)).isEmpty();
        assertThat(result.complexity().time()).isEqualTo("O(n)");
        assertThat(result.complexity().meetsIntended()).isFalse();
        assertThat(result.nextConcepts()).extracting(CodeReviewResult.Concept::name).containsExactly("수열의 합 공식");
    }

    @Test
    void 빠진_항목이나_없는_항목이_있으면_스키마를_어긴다() {
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replace("\"improvements\"", "\"improvement\"")))).isNotEmpty();
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replace("\"intendedTime\"", "\"intended\"")))).isNotEmpty();
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replace("\"reason\"", "\"code\"")))).isNotEmpty();
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replace("\"meetsIntended\":false", "\"meetsIntended\":\"no\""))))
                .isNotEmpty();
    }

    @Test
    void 항목_수가_범위를_벗어나면_스키마를_어긴다() {
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replaceFirst("\"nextConcepts\":\\[.*]}", "\"nextConcepts\":[]}"))))
                .isNotEmpty();
        String concept = "{\"name\":\"해시\",\"reason\":\"값을 빠르게 찾을 수 있어요.\"}";
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replaceFirst("\"nextConcepts\":\\[",
                "\"nextConcepts\":[" + (concept + ",").repeat(3))))).isNotEmpty();
        String improvement = "\"이름을 더 분명하게 지으면 읽기 쉬워요.\",";
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replaceFirst("\"improvements\":\\[",
                "\"improvements\":[" + improvement.repeat(4))))).isNotEmpty();
        // 고칠 것이 없으면 개선점은 비어도 된다.
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replaceFirst("(?s)\"improvements\":\\[.*?],",
                "\"improvements\":[],")))).isEmpty();
    }

    @Test
    void 스키마로_못_거는_빈_글은_제약이_거른다() {
        CodeReviewResult blank = JSON.readValue(SQUARE_SUM_ANSWER.replace("\"O(n)\"", "\" \"").replace("\"수열의 합 공식\"", "\" \""),
                CodeReviewResult.class);

        assertThat(VALIDATOR.validate(blank)).extracting(v -> v.getPropertyPath().toString())
                .containsExactlyInAnyOrder("complexity.time", "nextConcepts[0].name");
    }

    @Test
    void 글자_수는_스키마와_제약이_같은_기준으로_센다() {
        // 이모지는 UTF-16으로 두 칸이다. 스키마(코드 포인트)를 통과한 글을 제약이 다시 막으면 재요청도 같은 이유로 실패한다.
        String emoji = SQUARE_SUM_ANSWER.replace("저장하는 값은 n, total, i뿐이에요.", "😀".repeat(CodeReviewResult.BASIS_MAX_CHARS - 200));

        assertThat(SCHEMA.validate(JSON.readTree(emoji))).isEmpty();
        assertThat(VALIDATOR.validate(JSON.readValue(emoji, CodeReviewResult.class))).isEmpty();
    }

    @Test
    void 글자_수_상한은_스키마에도_있다() {
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replace("\"O(1)\"",
                "\"" + "가".repeat(CodeReviewResult.NOTATION_MAX_CHARS + 1) + "\"")))).isNotEmpty();
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replace("\"수열의 합 공식\"",
                "\"" + "가".repeat(CodeReviewResult.CONCEPT_NAME_MAX_CHARS + 1) + "\"")))).isNotEmpty();
        assertThat(SCHEMA.validate(JSON.readTree(SQUARE_SUM_ANSWER.replace("정확하게 풀었어요.",
                "가".repeat(CodeReviewResult.SUMMARY_MAX_CHARS))))).isNotEmpty();
    }

    @Test
    void 스키마의_키_순서는_고정이다() {
        // 모델은 properties 순서대로 쓴다. 복잡도의 근거를 먼저 쓰고 결론을 뒤에 쓰게 한다.
        String json = JSON.writeValueAsString(CodeReviewResult.SCHEMA);

        assertThat(json).containsSubsequence("\"summary\"", "\"complexity\"", "\"basis\"", "\"time\"", "\"space\"",
                "\"intendedTime\"", "\"comparison\"", "\"meetsIntended\"", "\"improvements\"", "\"nextConcepts\"", "\"name\"",
                "\"reason\"");
        assertThat(json.indexOf("\"properties\"")).isGreaterThan(json.indexOf("\"required\""));
    }

    @Test
    void 샘플마다_요청을_만들_수_있다() {
        assertThat(CodeReviewSamples.all()).hasSize(5)
                .allSatisfy(c -> assertThat(PROMPT.request(c.input()).user()).isEqualTo(c.input().toJson()));
        assertThat(CodeReviewSamples.all()).extracting(c -> c.input().submission().language())
                .contains(Language.PYTHON, Language.CPP);
        assertThat(CodeReviewSamples.all()).extracting(CodeReviewSamples.Case::meetsIntended).contains(true, false);
    }

    @Test
    void 샘플의_금지_글은_학습자_코드에_없다() {
        // 학습자 코드를 짚는 글은 허용하므로, 금지 글이 학습자 코드에 있으면 평가가 정상 응답을 실패로 본다.
        assertThat(CodeReviewSamples.all()).allSatisfy(c -> assertThat(c.forbidden())
                .noneMatch(forbidden -> c.input().submission().code().contains(forbidden)));
    }

    @Test
    void 다시_만들_때는_어긴_규칙을_한_번씩_알리고_지시를_강화한다() {
        CodeReviewInput input = CodeReviewSamples.countAtMost().input();
        LlmRequest<CodeReviewResult> first = PROMPT.request(input);
        LlmRequest<CodeReviewResult> retry = PROMPT.retry(input, List.of(
                new AnswerGuard.Violation(AnswerGuard.Rule.CODE_PATTERN, "improvements[0]", null),
                new AnswerGuard.Violation(AnswerGuard.Rule.CODE_PATTERN, "nextConcepts[1].reason", null),
                new AnswerGuard.Violation(AnswerGuard.Rule.REFERENCE_SIMILAR, "complexity.comparison", null)));

        assertThat(retry.system()).startsWith(first.system().strip())
                .contains("# 다시 쓰기", "리뷰를 받지 못한다", "괄호 없이 이름만", AnswerGuard.Rule.REFERENCE_SIMILAR.description)
                .doesNotContain("{{violations}}");
        // 같은 규칙은 한 번만 적는다. 앞서 만든 리뷰 글과 정답 코드는 보내지 않는다.
        assertThat(retry.system().split(AnswerGuard.Rule.CODE_PATTERN.description, -1)).hasSize(2);
        assertThat(retry.user()).isEqualTo(first.user());
        assertThat(retry.schema()).isSameAs(first.schema());
    }

    @Test
    void 없는_버전에는_다시_쓰기_지시도_있어야_한다() {
        assertThatThrownBy(() -> new CodeReviewPrompt("v999")).hasMessageContaining("prompts/code-review-v999/");
        assertThat(PromptFiles.read("prompts/code-review-v1/retry.md")).contains("{{violations}}");
    }

    private static CodeReviewInput input(Verdict verdict) {
        return new CodeReviewInput(
                Problem.of("곱셈", "A×B를 출력하세요.", "A와 B", "A×B", "0 < A, B < 10", 1000, 128, List.of("입출력")),
                Submission.of(Language.PYTHON, verdict, null, 10, 9000, "print(1)\n", null));
    }
}
