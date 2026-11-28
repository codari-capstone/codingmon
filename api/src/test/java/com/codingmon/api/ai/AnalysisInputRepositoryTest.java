package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.codingmon.api.ai.AnalysisInput.HiddenTests;
import com.codingmon.api.ai.AnalysisInput.Sample;
import com.codingmon.api.judge.RuntimeErrorType;
import com.codingmon.api.judge.Verdict;

// 실제 PostgreSQL에서 제출 하나로 분석 입력을 만든다. 비공개 케이스 원문이 JSON에 섞이지 않는지 본다(#75).
@SpringBootTest
class AnalysisInputRepositoryTest {

    // 비공개 케이스에만 넣는 표식. JSON에 하나라도 나오면 원문이 샌 것이다.
    private static final String HIDDEN_INPUT = "HIDDEN-INPUT-7f3a";
    private static final String HIDDEN_OUTPUT = "HIDDEN-OUTPUT-9c2b";
    private static final String HIDDEN_STDOUT = "HIDDEN-STDOUT-41d0";
    private static final String HIDDEN_STDERR = "HIDDEN-STDERR-e85f";

    @Autowired
    JdbcClient jdbc;

    @Autowired
    AnalysisInputRepository repository;

    String suffix;
    long userId;
    long problemId;
    long versionId;
    long tagId;

    @BeforeEach
    void setUp() {
        suffix = UUID.randomUUID().toString().substring(0, 8);
        userId = jdbc.sql("insert into users (email, nickname) values (:email, :nickname) returning id")
                .param("email", "ai-" + suffix + "@test.local").param("nickname", "ai-" + suffix)
                .query(Long.class).single();
        problemId = jdbc.sql("insert into problems (slug) values (:slug) returning id").param("slug", "ai-" + suffix)
                .query(Long.class).single();
        versionId = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty, statement_markdown,"
                + " input_description, output_description, constraints_markdown)"
                + " values (:problemId, 1, 'A+B', 'EASY', '두 수를 더한다', 'a b', 'a+b', '1 ≤ a, b ≤ 10') returning id")
                .param("problemId", problemId).query(Long.class).single();
        jdbc.sql("insert into problem_language_configs (problem_version_id, language, time_limit_ms, memory_limit_mb)"
                + " values (:versionId, 'PYTHON', 1000, 256)").param("versionId", versionId).update();
        tagId = jdbc.sql("insert into concept_tags (slug, name) values (:slug, :name) returning id")
                .param("slug", "ai-" + suffix).param("name", "구현-" + suffix).query(Long.class).single();
        jdbc.sql("insert into problem_version_tags (problem_version_id, concept_tag_id) values (:versionId, :tagId)")
                .param("versionId", versionId).param("tagId", tagId).update();
    }

    @AfterEach
    void tearDown() {
        // 사용자를 지우면 제출과 케이스 결과가 함께 지워지고, 버전을 지우면 케이스·언어 설정·태그 연결이 지워진다.
        jdbc.sql("delete from users where id = :id").param("id", userId).update();
        jdbc.sql("delete from problem_versions where id = :id").param("id", versionId).update();
        jdbc.sql("delete from problems where id = :id").param("id", problemId).update();
        jdbc.sql("delete from concept_tags where id = :id").param("id", tagId).update();
    }

    @Test
    void 비공개_케이스는_원문_없이_특성만_넣는다() {
        long sample1 = testCase(1, "SAMPLE", "1 2\n", "3\n");
        long hiddenSmall = testCase(2, "HIDDEN", HIDDEN_INPUT + "\n", HIDDEN_OUTPUT + "\n");
        long sample2 = testCase(3, "SAMPLE", "5 7\n", "12\n");
        long hiddenMedium = testCase(4, "HIDDEN", HIDDEN_INPUT.repeat(30), HIDDEN_OUTPUT);
        long hiddenLarge = testCase(5, "HIDDEN", (HIDDEN_INPUT + " ").repeat(1_000), HIDDEN_OUTPUT.repeat(1_000));
        long id = submission("SUBMIT", "COMPLETED", "WRONG_ANSWER", null);
        result(id, sample1, "WRONG_ANSWER", null, "-1\n", "");
        result(id, sample2, "WRONG_ANSWER", null, "-2\n", null);
        // 지금은 비공개 케이스의 출력을 저장하지 않지만, 저장하게 바뀌어도 AI에는 넣지 않아야 한다.
        result(id, hiddenSmall, "ACCEPTED", null, HIDDEN_STDOUT, HIDDEN_STDERR);
        result(id, hiddenMedium, "WRONG_ANSWER", null, HIDDEN_STDOUT, HIDDEN_STDERR);
        result(id, hiddenLarge, "RUNTIME_ERROR", "INDEX_ERROR", HIDDEN_STDOUT, HIDDEN_STDERR);

        AnalysisInput input = repository.find(id).orElseThrow();
        String json = input.toJson();

        assertThat(json).doesNotContain(HIDDEN_INPUT, HIDDEN_OUTPUT, HIDDEN_STDOUT, HIDDEN_STDERR);
        // 공개 예제 원문과 문제 정보는 들어간다. 위 검사가 빈 JSON으로 통과하지 않게 확인한다.
        assertThat(json).contains("\"input\":\"5 7\\n\"", "\"actualOutput\":\"-2\\n\"", "2| print(a - b)",
                "\"constraints\":\"1 ≤ a, b ≤ 10\"", "구현-" + suffix);
        assertThat(input.problem().timeLimitMs()).isEqualTo(1000);
        assertThat(input.samples().cases()).extracting(Sample::no).containsExactly(1, 2);
        assertThat(input.samples().total()).isEqualTo(2);
        assertThat(input.samples().failed()).isEqualTo(2);
        HiddenTests hidden = input.hiddenTests();
        assertThat(hidden.total()).isEqualTo(3);
        assertThat(hidden.passed()).isEqualTo(1);
        assertThat(hidden.failedVerdicts()).containsExactly(entry(Verdict.WRONG_ANSWER, 1), entry(Verdict.RUNTIME_ERROR, 1));
        assertThat(hidden.runtimeErrorTypes()).containsExactly(RuntimeErrorType.INDEX_ERROR);
        assertThat(hidden.smallestFailed()).isFalse();
        assertThat(hidden.largestFailed()).isTrue();
    }

    @Test
    void 컴파일_에러면_컴파일_메시지만_넣는다() {
        long sample = testCase(1, "SAMPLE", "1 2\n", "3\n");
        testCase(2, "HIDDEN", HIDDEN_INPUT, HIDDEN_OUTPUT);
        long id = submission("SUBMIT", "COMPLETED", "COMPILE_ERROR", "SyntaxError: '(' was never closed (line 2)");
        // 컴파일 에러로 끝나면 보낸 케이스 행은 판정이 빈 채로 남는다.
        jdbc.sql("insert into submission_test_results (submission_id, problem_version_id, test_case_id)"
                + " values (:id, :versionId, :caseId)").param("id", id).param("versionId", versionId).param("caseId", sample)
                .update();

        AnalysisInput input = repository.find(id).orElseThrow();

        assertThat(input.submission().compilerMessage()).contains("line 2");
        assertThat(input.samples()).isNull();
        assertThat(input.hiddenTests()).isNull();
        assertThat(input.toJson()).doesNotContain(HIDDEN_INPUT, HIDDEN_OUTPUT);
    }

    @Test
    void 코드_리뷰_입력은_문제와_제출만_읽는다() {
        testCase(1, "SAMPLE", "1 2\n", "3\n");
        testCase(2, "HIDDEN", HIDDEN_INPUT, HIDDEN_OUTPUT);
        long id = submission("SUBMIT", "COMPLETED", "ACCEPTED", null);

        CodeReviewInput input = repository.findReview(id).orElseThrow();

        assertThat(input.submission().verdict()).isEqualTo(Verdict.ACCEPTED);
        assertThat(input.problem().conceptTags()).isNotEmpty();
        // 정답 제출이라 예제와 비공개 테스트는 읽지 않는다(#82).
        assertThat(input.toJson()).doesNotContain(HIDDEN_INPUT, HIDDEN_OUTPUT, "\"samples\"", "\"hiddenTests\"");
        assertThat(repository.findReview(submission("SUBMIT", "RUNNING", null, null))).isEmpty();
        assertThat(repository.findReview(submission("SAMPLE_RUN", "COMPLETED", "ACCEPTED", null))).isEmpty();
    }

    @Test
    void 채점이_끝난_SUBMIT_제출만_받는다() {
        testCase(1, "SAMPLE", "1 2\n", "3\n");

        assertThat(repository.find(submission("SUBMIT", "RUNNING", null, null))).isEmpty();
        assertThat(repository.find(submission("SUBMIT", "JUDGE_ERROR", null, null))).isEmpty();
        assertThat(repository.find(submission("SAMPLE_RUN", "COMPLETED", "WRONG_ANSWER", null))).isEmpty();
        assertThat(repository.find(-1)).isEmpty();
    }

    private long testCase(int ordinal, String type, String input, String expected) {
        return jdbc.sql("insert into test_cases (problem_version_id, ordinal, case_type, input_data, expected_output)"
                + " values (:versionId, :ordinal, :type, :input, :expected) returning id")
                .param("versionId", versionId).param("ordinal", ordinal).param("type", type).param("input", input)
                .param("expected", expected).query(Long.class).single();
    }

    private long submission(String kind, String status, String verdict, String compilerMessage) {
        return jdbc.sql("insert into submissions (user_id, problem_version_id, submission_kind, language, source_code,"
                + " job_status, verdict, compiler_message)"
                + " values (:userId, :versionId, :kind, 'PYTHON', :source, :status, :verdict, :compilerMessage) returning id")
                .param("userId", userId).param("versionId", versionId).param("kind", kind)
                .param("source", "a, b = map(int, input().split())\nprint(a - b)\n").param("status", status)
                .param("verdict", verdict).param("compilerMessage", compilerMessage).query(Long.class).single();
    }

    private void result(long submissionId, long caseId, String verdict, String errorType, String stdout, String stderr) {
        jdbc.sql("insert into submission_test_results (submission_id, problem_version_id, test_case_id, verdict,"
                + " runtime_error_type, execution_time_ms, memory_used_kb, stdout, stderr)"
                + " values (:submissionId, :versionId, :caseId, :verdict, :errorType, 30, 9000, :stdout, :stderr)")
                .param("submissionId", submissionId).param("versionId", versionId).param("caseId", caseId)
                .param("verdict", verdict).param("errorType", errorType).param("stdout", stdout).param("stderr", stderr)
                .update();
    }
}
