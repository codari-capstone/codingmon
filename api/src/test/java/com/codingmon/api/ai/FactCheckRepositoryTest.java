package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

// 실제 PostgreSQL에서 사실 검증 자료를 읽는다(#79). 그 제출의 문제 버전에 있는 비공개 케이스 원문만 읽고, 학습자가 이미 볼 수 있는
// 글(공개 예제와 이 제출의 예제 실행 출력, 지문, 제출 코드)을 함께 읽는다.
@SpringBootTest
class FactCheckRepositoryTest {

    @Autowired
    JdbcClient jdbc;

    @Autowired
    FactCheckRepository repository;

    long userId;
    long problemId;
    long versionId;
    long otherVersionId;

    @BeforeEach
    void setUp() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        userId = jdbc.sql("insert into users (email, nickname) values (:email, :nickname) returning id")
                .param("email", "fc-" + suffix + "@test.local").param("nickname", "fc-" + suffix)
                .query(Long.class).single();
        problemId = jdbc.sql("insert into problems (slug) values (:slug) returning id").param("slug", "fc-" + suffix)
                .query(Long.class).single();
        versionId = version(1);
        otherVersionId = version(2);
    }

    @AfterEach
    void tearDown() {
        // 사용자를 지우면 제출과 케이스 결과가 함께 지워지고, 버전을 지우면 케이스가 지워진다.
        jdbc.sql("delete from users where id = :id").param("id", userId).update();
        jdbc.sql("delete from problem_versions where id in (:ids)").param("ids", List.of(versionId, otherVersionId))
                .update();
        jdbc.sql("delete from problems where id = :id").param("id", problemId).update();
    }

    @Test
    void 그_버전의_비공개_케이스_원문과_학습자가_볼_수_있는_글을_읽는다() {
        long sample = testCase(versionId, 1, "SAMPLE", "1 2\n", "3\n");
        testCase(versionId, 3, "HIDDEN", "x".repeat(FactCheckRepository.HIDDEN_TEXT_MAX_CHARS + 500), "HIDDEN-OUT-3\n");
        testCase(versionId, 2, "HIDDEN", "HIDDEN-IN-2\n", "HIDDEN-OUT-2\n");
        testCase(versionId, 4, "SAMPLE", "5 7\n", "12\n");
        testCase(otherVersionId, 1, "HIDDEN", "OTHER-VERSION-IN\n", "OTHER-VERSION-OUT\n");
        long id = submission();
        jdbc.sql("insert into submission_test_results (submission_id, problem_version_id, test_case_id, verdict, stdout,"
                + " stderr) values (:id, :versionId, :caseId, 'WRONG_ANSWER', '-1' || chr(10), 'oops')")
                .param("id", id).param("versionId", versionId).param("caseId", sample).update();

        FactCheck.Sources sources = repository.find(id).orElseThrow();

        // 입력을 ordinal 순으로, 그다음 기대 출력을 ordinal 순으로 읽는다. 긴 원문은 앞부분만 읽는다.
        assertThat(sources.hidden()).containsExactly("HIDDEN-IN-2\n",
                "x".repeat(FactCheckRepository.HIDDEN_TEXT_MAX_CHARS), "HIDDEN-OUT-2\n", "HIDDEN-OUT-3\n");
        assertThat(sources.open()).containsExactly("1 2\n\n3\n\n-1\n\noops", "5 7\n\n12\n",
                "A+B\n두 수를 더한다\na b\na+b\n1 ≤ a, b ≤ 10", "a, b = map(int, input().split())\nprint(a - b)\n");
        assertThat(sources.toString()).doesNotContain("HIDDEN", "1 2");
    }

    @Test
    void 없는_제출이면_비어_있다() {
        assertThat(repository.find(-1)).isEmpty();
    }

    private long version(int no) {
        long id = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty, statement_markdown,"
                + " input_description, output_description, constraints_markdown)"
                + " values (:problemId, :no, 'A+B', 'EASY', '두 수를 더한다', 'a b', 'a+b', '1 ≤ a, b ≤ 10') returning id")
                .param("problemId", problemId).param("no", no).query(Long.class).single();
        jdbc.sql("insert into problem_language_configs (problem_version_id, language, time_limit_ms, memory_limit_mb)"
                + " values (:versionId, 'PYTHON', 1000, 256)").param("versionId", id).update();
        return id;
    }

    private long testCase(long version, int ordinal, String type, String input, String expected) {
        return jdbc.sql("insert into test_cases (problem_version_id, ordinal, case_type, input_data, expected_output)"
                + " values (:versionId, :ordinal, :type, :input, :expected) returning id")
                .param("versionId", version).param("ordinal", ordinal).param("type", type).param("input", input)
                .param("expected", expected).query(Long.class).single();
    }

    private long submission() {
        return jdbc.sql("insert into submissions (user_id, problem_version_id, submission_kind, language, source_code,"
                + " job_status, verdict) values (:userId, :versionId, 'SUBMIT', 'PYTHON', :source, 'COMPLETED', 'WRONG_ANSWER')"
                + " returning id")
                .param("userId", userId).param("versionId", versionId)
                .param("source", "a, b = map(int, input().split())\nprint(a - b)\n").query(Long.class).single();
    }
}
