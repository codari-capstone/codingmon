package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.context.WebApplicationContext;

import com.jayway.jsonpath.JsonPath;

// 실제 PostgreSQL에서 AI 하루 한도(#80)를 확인한다. 한도를 3으로 줄여 돌린다. 모델은 가짜다.
// 동시 요청은 서로 다른 연결로 경쟁해야 하므로 테스트를 트랜잭션으로 감싸지 않는다.
// 가짜 모델이 바로 답하면 요청 응답이 PENDING(202)일지 이미 끝났을지(200) 정해지지 않으므로, 그런 요청은 상태를 기다린 뒤 본다.
@SpringBootTest(properties = { "app.llm.pending-timeout=1s", "app.llm.daily-limit=3" })
class AiQuotaIntegrationTest {

    private static final String RESULT_JSON = """
            {"summary":"두 수를 빼고 있어요","suspectLines":[2],"facts":["예제 1에서 3 대신 -1을 출력했어요"],\
            "guesses":["2번 줄에서 더하기 대신 빼기를 쓴 것 같아요"],\
            "hints":{"observation":"힌트 1","direction":"힌트 2","principle":"힌트 3"}}""";

    // 가짜 모델. answer가 정한 대로 답하고, 부른 횟수를 센다.
    static class FakeLlm implements LlmClient {

        final AtomicInteger calls = new AtomicInteger();
        volatile Supplier<LlmResponse<?>> answer = FakeLlm::ok;

        @Override
        public String model() {
            return "fake-model";
        }

        @Override
        public String promptVersion(ReviewType type) {
            return "v1";
        }

        @Override
        @SuppressWarnings("unchecked")
        public <T> LlmResponse<T> complete(LlmRequest<T> request) {
            calls.incrementAndGet();
            return (LlmResponse<T>) answer.get();
        }

        static LlmResponse<?> ok() {
            AnalysisResult result = new AnalysisResult("두 수를 빼고 있어요", List.of(2), List.of("예제 1에서 3 대신 -1을 출력했어요"),
                    List.of("2번 줄에서 더하기 대신 빼기를 쓴 것 같아요"), new AnalysisResult.Hints("힌트 1", "힌트 2", "힌트 3"));
            return new LlmResponse<>(result, RESULT_JSON, new LlmUsage(100, 50));
        }

        static LlmResponse<?> down() {
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "연결 실패", null, LlmUsage.NONE);
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        FakeLlm fakeLlm() {
            return new FakeLlm();
        }
    }

    @Autowired
    JdbcClient jdbc;

    @Autowired
    FakeLlm llm;

    @Autowired
    AnalysisService analyses;

    @Autowired
    TransactionTemplate transactions;

    @Autowired
    WebApplicationContext context;

    MockMvc mvc;
    long userId;
    long otherUserId;
    long problemId;
    long versionId;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(SecurityMockMvcConfigurers.springSecurity()).build();
        llm.calls.set(0);
        llm.answer = FakeLlm::ok;
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        userId = user("qt-" + suffix);
        otherUserId = user("qt2-" + suffix);
        problemId = jdbc.sql("insert into problems (slug) values (:slug) returning id").param("slug", "qt-" + suffix)
                .query(Long.class).single();
        versionId = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty, statement_markdown,"
                + " input_description, output_description) values (:problemId, 1, 'A+B', 'EASY', '두 수를 더한다', 'a b', 'a+b')"
                + " returning id")
                .param("problemId", problemId).query(Long.class).single();
        jdbc.sql("insert into problem_language_configs (problem_version_id, language, time_limit_ms, memory_limit_mb)"
                + " values (:versionId, 'PYTHON', 1000, 256)").param("versionId", versionId).update();
        jdbc.sql("insert into user_problem_stats (user_id, problem_id, attempt_count) values (:userId, :problemId, 1)")
                .param("userId", userId).param("problemId", problemId).update();
    }

    @AfterEach
    void tearDown() {
        // 사용자를 지우면 제출·AI 결과·풀이 통계가 함께 지워진다.
        jdbc.sql("delete from users where id in (:ids)").param("ids", List.of(userId, otherUserId)).update();
        jdbc.sql("delete from problem_versions where id = :id").param("id", versionId).update();
        jdbc.sql("delete from problems where id = :id").param("id", problemId).update();
    }

    @Test
    void 남은_횟수는_UTC_다음_자정에_초기화된다() throws Exception {
        Instant nextMidnight = jdbc.sql("select date_trunc('day', now(), 'UTC') + interval '24 hours'")
                .query(OffsetDateTime.class).single().toInstant();

        String body = mvc.perform(get("/api/users/me/ai-quota").with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limit").value(3))
                .andExpect(jsonPath("$.used").value(0))
                .andExpect(jsonPath("$.remaining").value(3))
                .andReturn().getResponse().getContentAsString();

        String resetsAt = JsonPath.read(body, "$.resetsAt");
        assertThat(resetsAt).endsWith("T00:00:00Z");
        assertThat(Instant.parse(resetsAt)).isEqualTo(nextMidnight);
        mvc.perform(get("/api/users/me/ai-quota")).andExpect(status().isUnauthorized());
    }

    @Test
    void 새로_만들_때만_세고_재사용_조회_힌트는_세지_않는다() throws Exception {
        long id = submission(userId);
        CountDownLatch release = new CountDownLatch(1);
        llm.answer = () -> {
            await(release);
            return FakeLlm.ok();
        };

        mvc.perform(post(analysis(id)).with(as(userId)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.quota.used").value(1))
                .andExpect(jsonPath("$.quota.remaining").value(2));
        // 만드는 중에 또 눌러도 세지 않는다.
        mvc.perform(post(analysis(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.quota.used").value(1));
        release.countDown();
        awaitStatus(id, "COMPLETED");

        mvc.perform(post(analysis(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quota.used").value(1));
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quota.used").value(1))
                .andExpect(jsonPath("$.quota.limit").value(3));
        for (int level = 1; level <= 3; level++) {
            hint(id, level).andExpect(status().isOk()).andExpect(jsonPath("$.quota.used").value(1));
        }
        assertThat(quotaUsed()).isEqualTo(1);
        assertThat(llm.calls).hasValue(1);
    }

    @Test
    void 실패는_세지_않고_다시_요청하면_그날_1회로_센다() throws Exception {
        long id = submission(userId);
        llm.answer = FakeLlm::down;

        mvc.perform(post(analysis(id)).with(as(userId)));
        awaitStatus(id, "FAILED");
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.quota.used").value(0));
        // 또 실패해도 0이다.
        mvc.perform(post(analysis(id)).with(as(userId)));
        awaitStatus(id, "FAILED");
        assertThat(quotaUsed()).isZero();

        llm.answer = FakeLlm::ok;
        mvc.perform(post(analysis(id)).with(as(userId))).andExpect(jsonPath("$.quota.used").value(1));
        awaitStatus(id, "COMPLETED");
        assertThat(quotaUsed()).isEqualTo(1);
        assertThat(llm.calls).hasValue(3);
    }

    @Test
    void 하루는_UTC_자정으로_나눈다() throws Exception {
        row(submission(userId), "ANALYSIS", "COMPLETED", "now() - interval '1 day'");
        row(submission(userId), "ANALYSIS", "COMPLETED", "date_trunc('day', now(), 'UTC') - interval '1 second'");
        assertThat(quotaUsed()).isZero();

        row(submission(userId), "ANALYSIS", "COMPLETED", "date_trunc('day', now(), 'UTC')");
        assertThat(quotaUsed()).isEqualTo(1);
    }

    @Test
    void 차단된_결과와_리뷰와_만드는_중인_결과는_세고_실패와_다른_사용자와_예제_실행은_세지_않는다() throws Exception {
        rowWith(submission(userId), "ANALYSIS", "COMPLETED", "{\"blocked\": true}", "now()");
        row(submission(userId), "CODE_REVIEW", "COMPLETED", "now()");
        row(submission(userId), "ANALYSIS", "PENDING", "now()");
        row(submission(userId), "ANALYSIS", "FAILED", "now()");
        row(submission(otherUserId), "ANALYSIS", "COMPLETED", "now()");
        row(submissionOfKind(userId, "SAMPLE_RUN"), "ANALYSIS", "COMPLETED", "now()");

        assertThat(quotaUsed()).isEqualTo(3);
    }

    @Test
    void 한도를_넘으면_429이고_아무것도_만들지_않지만_있는_결과는_그대로_쓴다() throws Exception {
        long done = submission(userId);
        mvc.perform(post(analysis(done)).with(as(userId)));
        awaitStatus(done, "COMPLETED");
        row(submission(userId), "ANALYSIS", "COMPLETED", "now()");
        row(submission(userId), "CODE_REVIEW", "COMPLETED", "now()");
        long fresh = submission(userId);
        int callsBefore = llm.calls.get();

        mvc.perform(post(analysis(fresh)).with(as(userId)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("AI_DAILY_LIMIT_EXCEEDED"))
                .andExpect(jsonPath("$.detail").value("오늘 쓸 수 있는 AI 분석·리뷰 3회를 모두 썼어요. 한국 시각 오전 9시에 다시 쓸 수 있어요"))
                .andExpect(jsonPath("$.quota.limit").value(3))
                .andExpect(jsonPath("$.quota.used").value(3))
                .andExpect(jsonPath("$.quota.remaining").value(0))
                .andExpect(jsonPath("$.quota.resetsAt").isNotEmpty());

        assertThat(llm.calls).hasValue(callsBefore);
        assertThat(rows(fresh)).isZero();
        // 이미 있는 결과는 한도를 다 써도 보고, 다시 요청하고, 힌트를 열 수 있다.
        mvc.perform(get(analysis(done)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quota.remaining").value(0));
        mvc.perform(post(analysis(done)).with(as(userId))).andExpect(status().isOk());
        hint(done, 1).andExpect(status().isOk()).andExpect(jsonPath("$.hints[0]").value("힌트 1"));
        assertThat(quotaUsed()).isEqualTo(3);
    }

    @Test
    void 한도를_넘은_재시도는_원래_행을_그대로_둔다() throws Exception {
        long failed = submission(userId);
        long failedRow = row(failed, "ANALYSIS", "FAILED", "now() - interval '2 days'");
        String before = snapshot(failedRow);
        for (int i = 0; i < 3; i++) {
            row(submission(userId), "ANALYSIS", "COMPLETED", "now()");
        }

        mvc.perform(post(analysis(failed)).with(as(userId)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("AI_DAILY_LIMIT_EXCEEDED"));

        assertThat(snapshot(failedRow)).isEqualTo(before);
        assertThat(llm.calls).hasValue(0);
    }

    @Test
    void 이미_센_결과를_다시_시작하면_한도를_낮춰_넘어도_막지_않는다() throws Exception {
        // 한도를 낮춘 날처럼 오늘 이미 한도(3)보다 많이 썼다. 그중 하나는 서버가 처리 중에 내려가 버려진 PENDING이다.
        for (int i = 0; i < 3; i++) {
            row(submission(userId), "ANALYSIS", "COMPLETED", "now()");
        }
        long abandoned = submission(userId);
        row(abandoned, "ANALYSIS", "PENDING", "greatest(date_trunc('day', now(), 'UTC'), now() - interval '5 seconds')");
        assertThat(quotaUsed()).isEqualTo(4);

        // 다시 시작해도 같은 행이라 횟수가 늘지 않으므로 막지 않는다.
        mvc.perform(post(analysis(abandoned)).with(as(userId)))
                .andExpect(jsonPath("$.quota.used").value(4))
                .andExpect(jsonPath("$.quota.remaining").value(0));
        awaitStatus(abandoned, "COMPLETED");
        // 새 결과는 막고, 본문에는 롤백한 뒤의 횟수를 준다.
        mvc.perform(post(analysis(submission(userId))).with(as(userId)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.quota.used").value(4))
                .andExpect(jsonPath("$.quota.remaining").value(0));
        assertThat(quotaUsed()).isEqualTo(4);
        assertThat(llm.calls).hasValue(1);
    }

    @Test
    void 서로_다른_제출을_동시에_요청해도_한도를_넘지_않는다() throws Exception {
        row(submission(userId), "ANALYSIS", "COMPLETED", "now()");
        row(submission(userId), "ANALYSIS", "COMPLETED", "now()");
        List<Supplier<Object>> requests = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            long id = submission(userId);
            requests.add(() -> requestOrError(id));
        }
        CountDownLatch release = new CountDownLatch(1);
        llm.answer = () -> {
            await(release);
            return FakeLlm.ok();
        };

        List<Object> results = race(requests);

        List<AnalysisService.Requested> started = results.stream().filter(AnalysisService.Requested.class::isInstance)
                .map(AnalysisService.Requested.class::cast).toList();
        assertThat(started).hasSize(1);
        assertThat(started.getFirst().started()).isTrue();
        assertThat(results).filteredOn("AI_DAILY_LIMIT_EXCEEDED"::equals).hasSize(4);
        assertThat(rowsToday()).isEqualTo(3);
        // 커밋한 뒤에 처리기에 넣었으므로 결과를 저장한다.
        release.countDown();
        awaitStatus(started.getFirst().view().submissionId(), "COMPLETED");
    }

    @Test
    void 같은_제출을_동시에_요청하면_한_번만_만든다() throws Exception {
        long id = submission(userId);
        CountDownLatch release = new CountDownLatch(1);
        llm.answer = () -> {
            await(release);
            return FakeLlm.ok();
        };
        List<Supplier<Object>> requests = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            requests.add(() -> requestOrError(id));
        }

        List<Object> results = race(requests);

        assertThat(results).allMatch(AnalysisService.Requested.class::isInstance);
        assertThat(results.stream().filter(r -> ((AnalysisService.Requested) r).started()).count()).isEqualTo(1);
        assertThat(rows(id)).isEqualTo(1);
        release.countDown();
        awaitStatus(id, "COMPLETED");
        assertThat(llm.calls).hasValue(1);
        assertThat(quotaUsed()).isEqualTo(1);
    }

    @Test
    void 탈퇴와_겹쳐도_교착하지_않고_404로_답한다() throws Exception {
        long id = submission(userId);
        CountDownLatch deleted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            // MyAccountService.withdraw와 같은 순서다. 제출을 먼저 지운 채 분석 요청이 기다리게 한 뒤 사용자를 지운다.
            Future<?> withdraw = pool.submit(() -> transactions.executeWithoutResult(status -> {
                jdbc.sql("delete from submissions where user_id = :id").param("id", userId).update();
                deleted.countDown();
                await(release);
                jdbc.sql("delete from users where id = :id").param("id", userId).update();
            }));
            assertThat(deleted.await(10, TimeUnit.SECONDS)).isTrue();
            Future<Object> request = pool.submit(() -> requestOrError(id));
            awaitLockWait();
            release.countDown();

            withdraw.get(20, TimeUnit.SECONDS);
            assertThat(request.get(20, TimeUnit.SECONDS)).isEqualTo("SUBMISSION_NOT_FOUND");
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
        assertThat(llm.calls).hasValue(0);
    }

    // 다른 연결이 행 잠금을 기다리기 시작할 때까지 기다린다.
    private void awaitLockWait() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            int waiting = jdbc.sql("select count(*) from pg_stat_activity"
                    + " where datname = current_database() and wait_event_type = 'Lock'")
                    .query(Integer.class).single();
            if (waiting > 0) {
                return;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("분석 요청이 잠금을 기다리지 않았다");
    }

    // 요청을 한꺼번에 출발시켜 결과(성공이면 Requested, 오류면 code)를 모은다. 연결 풀(기본 10)을 넘지 않게 5개까지만 쓴다.
    private List<Object> race(List<Supplier<Object>> requests) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(requests.size());
        try {
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Object>> futures = new ArrayList<>();
            for (Supplier<Object> request : requests) {
                futures.add(pool.submit(() -> {
                    go.await();
                    return request.get();
                }));
            }
            go.countDown();
            List<Object> results = new ArrayList<>();
            for (Future<Object> future : futures) {
                results.add(future.get(20, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    private Object requestOrError(long submissionId) {
        try {
            return analyses.request(userId, submissionId);
        } catch (ErrorResponseException e) {
            return e.getBody().getProperties().get("code");
        }
    }

    // 서버가 센 오늘 횟수(GET /api/users/me/ai-quota).
    private int quotaUsed() throws Exception {
        String body = mvc.perform(get("/api/users/me/ai-quota").with(as(userId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.used");
    }

    // 서버를 거치지 않고 직접 센 오늘의 FAILED가 아닌 행 수. 동시 요청이 한도를 넘겼는지 따로 확인한다.
    private int rowsToday() {
        return jdbc.sql("select count(*) from ai_reviews r join submissions s on s.id = r.submission_id"
                + " where s.user_id = :userId and r.status <> 'FAILED'"
                + " and r.created_at >= date_trunc('day', now(), 'UTC')")
                .param("userId", userId).query(Integer.class).single();
    }

    private int rows(long submissionId) {
        return jdbc.sql("select count(*) from ai_reviews where submission_id = :id").param("id", submissionId)
                .query(Integer.class).single();
    }

    private String snapshot(long reviewId) {
        return jdbc.sql("select status || ' ' || created_at || ' ' || coalesce(content::text, '-') from ai_reviews"
                + " where id = :id").param("id", reviewId).query(String.class).single();
    }

    private long row(long submissionId, String type, String status, String createdAt) {
        return rowWith(submissionId, type, status, "COMPLETED".equals(status) ? RESULT_JSON : null, createdAt);
    }

    // createdAt은 SQL 식이다(날짜 경계를 DB 시계 기준으로 만든다).
    private long rowWith(long submissionId, String type, String status, String content, String createdAt) {
        return jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, status, content,"
                + " created_at, completed_at) values (:submissionId, :type, 'v1', 'fake-model', :status,"
                + " cast(:content as jsonb), " + createdAt + ", case when :status = 'PENDING' then null else now() end)"
                + " returning id")
                .param("submissionId", submissionId).param("type", type).param("status", status)
                .param("content", content).query(Long.class).single();
    }

    private ResultActions hint(long id, int level) throws Exception {
        return mvc.perform(post(analysis(id) + "/hints").with(as(userId)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"level\":" + level + "}"));
    }

    private void awaitStatus(long submissionId, String expected) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        String status = null;
        while (System.nanoTime() < deadline) {
            status = jdbc.sql("select status from ai_reviews where submission_id = :id").param("id", submissionId)
                    .query(String.class).optional().orElse(null);
            if (expected.equals(status)) {
                return;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("AI 분석 상태가 " + expected + "가 되지 않았다: " + status);
    }

    private long user(String name) {
        return jdbc.sql("insert into users (email, nickname) values (:email, :nickname) returning id")
                .param("email", name + "@test.local").param("nickname", name).query(Long.class).single();
    }

    private long submission(long owner) {
        return submissionOfKind(owner, "SUBMIT");
    }

    private long submissionOfKind(long owner, String kind) {
        return jdbc.sql("insert into submissions (user_id, problem_version_id, submission_kind, language, source_code,"
                + " job_status, verdict, judged_at)"
                + " values (:userId, :versionId, :kind, 'PYTHON', :source, 'COMPLETED', 'WRONG_ANSWER', :judgedAt)"
                + " returning id")
                .param("userId", owner).param("versionId", versionId).param("kind", kind)
                .param("source", "a, b = map(int, input().split())\nprint(a - b)\n")
                .param("judgedAt", OffsetDateTime.now(ZoneOffset.UTC))
                .query(Long.class).single();
    }

    private static String analysis(long submissionId) {
        return "/api/submissions/" + submissionId + "/analysis";
    }

    private static RequestPostProcessor as(long id) {
        return SecurityMockMvcRequestPostProcessors.jwt().jwt(jwt -> jwt.subject(String.valueOf(id)));
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
