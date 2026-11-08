package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

// V4가 표를 만들면서 이미 끝난 코드 리뷰의 다음 개념을 content에서 채우는지 본다(#83).
// 앱이 쓰는 스키마와 섞이지 않게 새 스키마에 V2까지 올리고 리뷰를 넣은 뒤 V4까지 올린다. 끝나면 스키마를 지운다.
@SpringBootTest
class NextConceptBackfillMigrationTest {

    @Autowired
    JdbcClient jdbc;

    @Value("${spring.datasource.url}")
    String url;

    @Value("${spring.datasource.username}")
    String username;

    @Value("${spring.datasource.password}")
    String password;

    String schema;

    @BeforeEach
    void setUp() {
        schema = "backfill_" + UUID.randomUUID().toString().substring(0, 8);
    }

    @AfterEach
    void tearDown() {
        jdbc.sql("drop schema if exists " + schema + " cascade").update();
    }

    @Test
    void 표를_만들기_전에_끝난_코드_리뷰의_개념을_채운다() {
        migrate("2");
        long submissionId = submission();
        long reviewed = review(submissionId, "CODE_REVIEW", "v1", "COMPLETED", """
                {"summary": "좋아요", "nextConcepts": [
                  {"name": "이진 탐색", "reason": "정렬된 값에서 찾을 때 좋아요."},
                  {"name": "누적 합", "reason": "구간 합을 빨리 구해요."}]}""");
        // 차단된 결과, 실패한 시도, 오답 분석은 옮기지 않는다
        review(submissionId, "CODE_REVIEW", "v2", "COMPLETED", "{\"blocked\": true}");
        review(submissionId, "CODE_REVIEW", "v3", "FAILED", null);
        review(submissionId, "ANALYSIS", "v1", "COMPLETED", "{\"nextConcepts\": [{\"name\": \"분석\", \"reason\": \"이유\"}]}");
        // 형식이 어긋난 값이 있어도 멈추지 않고 그 항목만 건너뛴다
        long odd = review(submissionId, "CODE_REVIEW", "v4", "COMPLETED", """
                {"nextConcepts": [{"name": "이름만"}, "문자열", {"name": "투 포인터", "reason": "두 위치를 같이 옮겨요."}]}""");
        review(submissionId, "CODE_REVIEW", "v5", "COMPLETED", "{\"nextConcepts\": \"배열 아님\"}");

        migrate("4");

        assertThat(jdbc.sql("select ai_review_id || ' ' || ordinal || ' ' || name || ' ' || reason"
                + " || ' ' || coalesce(concept_tag_id::text, '-') from " + schema + ".ai_review_next_concepts"
                + " order by ai_review_id, ordinal").query(String.class).list()).containsExactly(
                reviewed + " 1 이진 탐색 정렬된 값에서 찾을 때 좋아요. -",
                reviewed + " 2 누적 합 구간 합을 빨리 구해요. -",
                odd + " 3 투 포인터 두 위치를 같이 옮겨요. -");
    }

    private void migrate(String target) {
        Flyway.configure().dataSource(url, username, password).schemas(schema).target(target).load().migrate();
    }

    private long submission() {
        long userId = jdbc.sql("insert into " + schema + ".users (email, nickname) values ('backfill@test.local', 'backfill')"
                + " returning id").query(Long.class).single();
        long problemId = jdbc.sql("insert into " + schema + ".problems (slug) values ('backfill') returning id")
                .query(Long.class).single();
        long versionId = jdbc.sql("insert into " + schema + ".problem_versions (problem_id, version_no, title, difficulty,"
                + " statement_markdown, input_description, output_description, constraints_markdown)"
                + " values (:problemId, 1, '합 구하기', 'EASY', '1부터 N까지 더한다', 'N', '합', '1 ≤ N ≤ 100') returning id")
                .param("problemId", problemId).query(Long.class).single();
        return jdbc.sql("insert into " + schema + ".submissions (user_id, problem_version_id, submission_kind, language,"
                + " source_code, job_status, verdict)"
                + " values (:userId, :versionId, 'SUBMIT', 'PYTHON', 'print(1)', 'COMPLETED', 'ACCEPTED') returning id")
                .param("userId", userId).param("versionId", versionId).query(Long.class).single();
    }

    private long review(long submissionId, String type, String version, String status, String content) {
        return jdbc.sql("insert into " + schema + ".ai_reviews (submission_id, review_type, prompt_version, model, status,"
                + " content, completed_at) values (:submissionId, :type, :version, 'test-model', :status,"
                + " cast(:content as jsonb), now()) returning id")
                .param("submissionId", submissionId).param("type", type).param("version", version).param("status", status)
                .param("content", content).query(Long.class).single();
    }
}
