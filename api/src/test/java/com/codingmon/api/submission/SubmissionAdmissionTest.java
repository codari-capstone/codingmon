package com.codingmon.api.submission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.context.WebApplicationContext;

import com.codingmon.api.Language;

// 실제 PostgreSQL의 서로 다른 트랜잭션으로 접수 상한을 경쟁시킨다. Judge0는 호출하지 않는다.
// 채점 처리기는 끄고(app.judge0.url 비움) 상한만 켠다.
@SpringBootTest(properties = { "app.judge0.url=", "app.judge.pending-limit-enabled=true", "app.judge.user-pending-limit=3",
        "app.judge.pending-limit=4" })
class SubmissionAdmissionTest {
    @Autowired JdbcClient jdbc;
    @Autowired WebApplicationContext context;
    @Autowired TransactionTemplate transactions;
    MockMvc mvc;
    final List<Long> users = new ArrayList<>();
    long problemId;
    long versionId;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(SecurityMockMvcConfigurers.springSecurity()).build();
        String suffix = UUID.randomUUID().toString();
        for (int i = 0; i < 3; i++) {
            users.add(jdbc.sql("insert into users (nickname) values (:nickname) returning id")
                    .param("nickname", "admission-" + i + suffix).query(Long.class).single());
        }
        problemId = jdbc.sql("insert into problems (slug) values (:slug) returning id")
                .param("slug", "admission-" + suffix).query(Long.class).single();
        versionId = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty, statement_markdown,"
                + " input_description, output_description, status, published_at)"
                + " values (:id, 1, 'fixture', 'EASY', 'fixture', 'fixture', 'fixture', 'PUBLISHED', now()) returning id")
                .param("id", problemId).query(Long.class).single();
        jdbc.sql("insert into problem_language_configs (problem_version_id, language, time_limit_ms, memory_limit_mb)"
                + " values (:id, 'PYTHON', 1000, 256)").param("id", versionId).update();
    }

    @AfterEach
    void cleanUp() {
        jdbc.sql("delete from users where id in (:ids)").param("ids", users).update();
        jdbc.sql("delete from problem_versions where id = :id").param("id", versionId).update();
        jdbc.sql("delete from problems where id = :id").param("id", problemId).update();
    }

    @Test
    void 제출과_예제실행은_미완료_상한을_공유하고_완료하면_다시_접수한다() throws Exception {
        long user = users.getFirst();
        assertThat(admit(user, false)).isEqualTo(202);
        assertThat(admit(user, true)).isEqualTo(202);
        assertThat(admit(user, true)).isEqualTo(202);
        // QUEUED뿐 아니라 실행 중인 작업도 사용자의 몫에 남는다.
        jdbc.sql("update submissions set job_status = 'RUNNING' where user_id = :id").param("id", user).update();
        assertThat(admit(user, false)).isEqualTo(429);
        assertThat(count()).isEqualTo(3);
        jdbc.sql("update submissions set job_status = 'JUDGE_ERROR' where user_id = :id").param("id", user).update();
        assertThat(admit(user, false)).isEqualTo(202);
    }

    @Test
    void 동시에_같은_사용자가_두_주소로_접수해도_상한을_넘지_않는다() throws Exception {
        List<Integer> statuses = race(false);
        assertThat(statuses.stream().filter(s -> s == 202).count()).isEqualTo(3);
        assertThat(statuses).allMatch(s -> s == 202 || s == 429);
        assertThat(count()).isEqualTo(3);
    }

    @Test
    void 여러_사용자가_동시에_접수해도_전체_상한을_넘지_않는다() throws Exception {
        List<Integer> statuses = race(true);
        assertThat(statuses.stream().filter(s -> s == 202).count()).isEqualTo(4);
        assertThat(statuses).allMatch(s -> s == 202 || s == 429);
        assertThat(count()).isEqualTo(4);
    }

    @Test
    void 따로_정하지_않으면_채점_서버가_있을_때만_상한을_적용한다() {
        // 채점 서버가 없으면 처리기가 돌지 않아 미완료 작업이 끝나지 않는다. 그때 상한을 걸면 영구히 429다.
        var withJudge = new SubmissionRepository(jdbc, 1, 1, "", "http://127.0.0.1:2358");
        var withoutJudge = new SubmissionRepository(jdbc, 1, 1, "", "");
        long user = users.getFirst();
        insert(withJudge, user);
        assertThatThrownBy(() -> insert(withJudge, user)).isInstanceOfSatisfying(ErrorResponseException.class,
                e -> assertThat(e.getBody().getProperties().get("code")).isEqualTo("JUDGE_QUEUE_FULL"));
        insert(withoutJudge, user);
        insert(withoutJudge, user);
        assertThat(count()).isEqualTo(3);
    }

    private void insert(SubmissionRepository repository, long user) {
        transactions.executeWithoutResult(s -> repository.insertQueued(user, versionId, SubmissionRepository.Kind.SUBMIT,
                Language.PYTHON, "print(1)"));
    }

    private List<Integer> race(boolean differentUsers) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(8)) {
            var futures = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (int i = 0; i < 8; i++) {
                long user = users.get(differentUsers ? i % users.size() : 0);
                boolean sample = i % 2 == 0;
                futures.add(pool.submit(() -> {
                    if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("start timeout");
                    return admit(user, sample);
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (var future : futures) statuses.add(future.get(15, TimeUnit.SECONDS));
            return statuses;
        }
    }

    private int admit(long user, boolean sample) throws Exception {
        return mvc.perform(post(sample ? "/api/sample-runs" : "/api/submissions")
                .with(jwt().jwt(j -> j.subject(Long.toString(user))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"problemId\":" + problemId + ",\"language\":\"PYTHON\",\"sourceCode\":\"print(1)\"}"))
                .andReturn().getResponse().getStatus();
    }

    private int count() {
        return jdbc.sql("select count(*) from submissions where problem_version_id = :id")
                .param("id", versionId).query(Integer.class).single();
    }
}
