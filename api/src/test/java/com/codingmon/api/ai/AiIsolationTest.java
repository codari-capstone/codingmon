package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import javax.sql.DataSource;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.zaxxer.hikari.HikariDataSource;

// AI가 응답하지 않거나 AI 대기열이 꽉 차도 채점·예제 실행·학습 기록 API가 늦어지지 않는지 실제 PostgreSQL로 확인한다(#81).
// 모델은 풀어 줄 때까지 돌아오지 않는 가짜다. 처리기 1개·대기열 1칸이라 요청 둘이면 꽉 차고 셋째는 BUSY다.
// DB 연결을 2개로 줄여, AI 처리기가 모델을 기다리며 연결을 쥐고 있으면 조회가 연결을 기다리다 시간을 넘기게 한다.
// 채점 처리기는 JUDGE0_URL이 비어 꺼져 있으므로, 새 제출·예제 실행은 받는 것(QUEUED)까지만 본다.
// 학습 리포트(#85)도 같은 처리기를 쓰므로 만드는 동안 연결을 쥐지 않는지 따로 본다.
@SpringBootTest(properties = { "app.llm.workers=1", "app.llm.queue-capacity=1",
        "spring.datasource.hikari.maximum-pool-size=2" })
class AiIsolationTest {

    private static final Logger log = LoggerFactory.getLogger(AiIsolationTest.class);
    // 모델 읽기 제한(180초)·버려진 PENDING 기준(15분)과 확실히 구분되는 상한. 밀리초 비교는 실행 환경에 따라 흔들린다.
    private static final Duration LIMIT = Duration.ofSeconds(5);

    // 풀어 줄 때까지 돌아오지 않는 모델. 부른 스레드 이름을 남긴다.
    static class StuckLlm implements LlmClient {

        volatile CountDownLatch started = new CountDownLatch(1);
        volatile CountDownLatch release = new CountDownLatch(1);
        final Set<String> threads = ConcurrentHashMap.newKeySet();

        @Override
        public String model() {
            return "stuck-model";
        }

        @Override
        public String promptVersion(ReviewType type) {
            return "v1";
        }

        @Override
        @SuppressWarnings("unchecked")
        public <T> LlmResponse<T> complete(LlmRequest<T> request) {
            threads.add(Thread.currentThread().getName());
            started.countDown();
            try {
                release.await(60, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            if (request.responseType() == LearningReportResult.class) {
                return (LlmResponse<T>) report(request);
            }
            return (LlmResponse<T>) AnalysisControllerTest.FakeLlm.ok();
        }

        // 학습 리포트 응답. 취약 개념은 없고(태그 없는 문제만 맞혔다), 추천 순위는 입력마다 만드는 스키마의 enum에서 읽는다.
        @SuppressWarnings("unchecked")
        private static LlmResponse<?> report(LlmRequest<?> request) {
            Map<String, Object> recommendations = (Map<String, Object>) ((Map<String, Object>) request.schema()
                    .get("properties")).get("recommendations");
            List<Integer> ranks = recommendations.get("maxItems").equals(0) ? List.of()
                    : (List<Integer>) ((Map<String, Object>) ((Map<String, Object>) ((Map<String, Object>) recommendations
                            .get("items")).get("properties")).get("rank")).get("enum");
            return new LlmResponse<>(new LearningReportResult(List.of(),
                    ranks.stream().map(r -> new LearningReportResult.RecommendationReason(r, "도전해 봐요.")).toList(),
                    "고르게 잘하고 있어요."), "{}", LlmUsage.NONE);
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        StuckLlm stuckLlm() {
            return new StuckLlm();
        }
    }

    @Autowired
    JdbcClient jdbc;

    @Autowired
    StuckLlm llm;

    @Autowired
    DataSource dataSource;

    @Autowired
    WebApplicationContext context;

    MockMvc mvc;
    long userId;
    long problemId;
    long versionId;
    // 학습 리포트 조건(맞힌 문제 5개)을 채우려고 만든 문제
    final List<Long> solvedProblemIds = new ArrayList<>();

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(SecurityMockMvcConfigurers.springSecurity()).build();
        llm.started = new CountDownLatch(1);
        llm.release = new CountDownLatch(1);
        llm.threads.clear();
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        userId = jdbc.sql("insert into users (email, nickname) values (:email, :nickname) returning id")
                .param("email", "iso-" + suffix + "@test.local").param("nickname", "iso-" + suffix)
                .query(Long.class).single();
        problemId = jdbc.sql("insert into problems (slug) values (:slug) returning id").param("slug", "iso-" + suffix)
                .query(Long.class).single();
        // 새 제출·예제 실행을 받으려면 공개된 버전이어야 한다.
        versionId = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty, statement_markdown,"
                + " input_description, output_description, status, published_at)"
                + " values (:problemId, 1, 'A+B', 'EASY', '두 수를 더한다', 'a b', 'a+b', 'PUBLISHED', now()) returning id")
                .param("problemId", problemId).query(Long.class).single();
        jdbc.sql("insert into problem_language_configs (problem_version_id, language, time_limit_ms, memory_limit_mb)"
                + " values (:versionId, 'PYTHON', 1000, 256)").param("versionId", versionId).update();
        jdbc.sql("insert into user_problem_stats (user_id, problem_id, attempt_count) values (:userId, :problemId, 3)")
                .param("userId", userId).param("problemId", problemId).update();
    }

    @AfterEach
    void tearDown() throws InterruptedException {
        llm.release.countDown();
        awaitNoPending();
        // 사용자를 지우면 제출·AI 결과·풀이 통계가 함께 지워진다.
        jdbc.sql("delete from users where id = :id").param("id", userId).update();
        jdbc.sql("delete from problem_versions where id = :id").param("id", versionId).update();
        jdbc.sql("delete from problems where id = :id").param("id", problemId).update();
        if (!solvedProblemIds.isEmpty()) {
            jdbc.sql("delete from problems where id in (:ids)").param("ids", solvedProblemIds).update();
            solvedProblemIds.clear();
        }
    }

    @Test
    void 학습_리포트를_만드는_동안에도_통계와_리포트_조회는_바로_응답하고_DB_연결을_쥐지_않는다() throws Exception {
        // 태그 없는 문제 5개를 맞혔다. 개념별 통계는 비고, 추천은 아직 맞히지 않은 공개 문제(A+B)를 도전 문제로 고른다.
        for (int i = 0; i < 5; i++) {
            long id = jdbc.sql("insert into problems (slug) values (:slug) returning id")
                    .param("slug", "iso-solved-" + UUID.randomUUID().toString().substring(0, 12)).query(Long.class).single();
            solvedProblemIds.add(id);
            jdbc.sql("insert into user_problem_stats (user_id, problem_id, attempt_count, solved, first_solved_at)"
                    + " values (:userId, :problemId, 1, true, now())").param("userId", userId).param("problemId", id)
                    .update();
        }

        mvc.perform(post("/api/users/me/learning-report").with(as(userId))).andExpect(status().isAccepted());
        assertThat(llm.started.await(5, TimeUnit.SECONDS)).isTrue();

        expectOk(within("학습 통계", get("/api/users/me/learning-stats").with(as(userId))));
        expectOk(within("학습 리포트 조회", get("/api/users/me/learning-report").with(as(userId))));
        HikariDataSource pool = dataSource.unwrap(HikariDataSource.class);
        assertThat(eventually(() -> pool.getHikariPoolMXBean().getActiveConnections() == 0)).isTrue();
        assertThat(llm.threads).isNotEmpty().allMatch(name -> name.startsWith("ai-"));

        llm.release.countDown();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        String status = null;
        while (System.nanoTime() < deadline && !"COMPLETED".equals(status)) {
            Thread.sleep(50);
            status = jdbc.sql("select status from learning_reports where user_id = :userId").param("userId", userId)
                    .query(String.class).single();
        }
        assertThat(status).isEqualTo("COMPLETED");
    }

    @Test
    void AI가_멈추고_대기열이_차도_채점_예제_실행_학습_기록_조회는_바로_응답한다() throws Exception {
        long wrong1 = submission("WRONG_ANSWER");
        long wrong2 = submission("WRONG_ANSWER");
        long wrong3 = submission("WRONG_ANSWER");
        long accepted = submission("ACCEPTED");

        // 1은 모델이 붙잡고 있고, 2는 대기열 한 칸을 차지한다.
        mvc.perform(post(analysis(wrong1)).with(as(userId))).andExpect(status().isAccepted());
        assertThat(llm.started.await(5, TimeUnit.SECONDS)).isTrue();
        mvc.perform(post(analysis(wrong2)).with(as(userId))).andExpect(status().isAccepted());
        // 3은 기다리지 않고 바로 실패하고, 실패는 하루 한도에 세지 않는다.
        mvc.perform(post(analysis(wrong3)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failureReason").value("BUSY"))
                .andExpect(jsonPath("$.quota.used").value(2));

        // 모델이 멈춰 있는 동안의 채점·예제 실행·학습 기록 API
        long queued = idOf(within("새 제출", post("/api/submissions").with(as(userId))
                .contentType(MediaType.APPLICATION_JSON).content(sourceBody())), 202);
        long sampleRun = idOf(within("새 예제 실행", post("/api/sample-runs").with(as(userId))
                .contentType(MediaType.APPLICATION_JSON).content(sourceBody())), 202);
        expectOk(within("채점 결과", get("/api/submissions/" + accepted).with(as(userId))));
        expectOk(within("채점 상태", get("/api/submissions/" + queued).with(as(userId))));
        expectOk(within("예제 실행 상태", get("/api/sample-runs/" + sampleRun).with(as(userId))));
        expectOk(within("문제별 제출 목록", get("/api/submissions").param("problemId", String.valueOf(problemId))
                .with(as(userId))));
        expectOk(within("제출 기록", get("/api/users/me/problem-history").with(as(userId))));
        expectOk(within("학습 통계", get("/api/users/me/learning-stats").with(as(userId))));
        // AI 결과 조회도 모델을 기다리지 않는다.
        expectOk(within("AI 분석 조회", get(analysis(wrong1)).with(as(userId))));

        // 모델을 기다리는 처리기 스레드는 DB 연결을 쥐고 있지 않다(예약 작업이 잠깐 쓰는 연결은 곧 돌아온다).
        HikariDataSource pool = dataSource.unwrap(HikariDataSource.class);
        assertThat(eventually(() -> pool.getHikariPoolMXBean().getActiveConnections() == 0)).isTrue();
        assertThat(llm.threads).isNotEmpty().allMatch(name -> name.startsWith("ai-"));
        assertThat(llm.release.getCount()).as("측정하는 동안 모델은 계속 멈춰 있었다").isEqualTo(1);

        // 모델이 돌아오면 쌓인 분석이 끝나고, 자리가 생겨 BUSY였던 것도 다시 요청할 수 있다.
        llm.release.countDown();
        awaitStatus(wrong1, "COMPLETED");
        awaitStatus(wrong2, "COMPLETED");
        // 모델이 바로 답하므로 응답 전에 끝나 200(COMPLETED)일 수도 있다.
        mvc.perform(post(analysis(wrong3)).with(as(userId)))
                .andExpect(status().is2xxSuccessful())
                .andExpect(jsonPath("$.failureReason").isEmpty());
        awaitStatus(wrong3, "COMPLETED");
    }

    // 상한 안에 끝나야 한다. 걸린 시간은 PR에 적으려고 남긴다.
    private MvcResult within(String label, RequestBuilder request) {
        return assertTimeoutPreemptively(LIMIT, () -> {
            long start = System.nanoTime();
            MvcResult result = mvc.perform(request).andReturn();
            log.info("AI가 멈춘 동안 {}: {}ms, 상태 {}", label, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start),
                    result.getResponse().getStatus());
            return result;
        }, label + " 응답이 " + LIMIT.toSeconds() + "초 안에 오지 않았다");
    }

    private static void expectOk(MvcResult result) {
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    // 202 응답 본문 {"id": n}의 번호
    private static long idOf(MvcResult result, int expectedStatus) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(expectedStatus);
        return Long.parseLong(result.getResponse().getContentAsString().replaceAll("\\D", ""));
    }

    private String sourceBody() {
        return """
                {"problemId": %d, "language": "PYTHON", "sourceCode": "a, b = map(int, input().split())\\nprint(a + b)\\n"}"""
                .formatted(problemId);
    }

    private static boolean eventually(BooleanSupplier condition) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return true;
            }
            Thread.sleep(50);
        }
        return condition.getAsBoolean();
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

    // 처리기에 남은 시도가 끝난 뒤에 사용자를 지운다. 지운 뒤 끝나면 결과를 쓸 행이 없어 오류 로그가 남는다.
    private void awaitNoPending() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            int pending = jdbc.sql("select count(*) from ai_reviews r join submissions s on s.id = r.submission_id"
                    + " where s.user_id = :userId and r.status = 'PENDING'").param("userId", userId)
                    .query(Integer.class).single();
            if (pending == 0) {
                return;
            }
            Thread.sleep(50);
        }
    }

    private long submission(String verdict) {
        return jdbc.sql("insert into submissions (user_id, problem_version_id, submission_kind, language, source_code,"
                + " job_status, verdict, judged_at)"
                + " values (:userId, :versionId, 'SUBMIT', 'PYTHON', :source, 'COMPLETED', :verdict, :judgedAt) returning id")
                .param("userId", userId).param("versionId", versionId)
                .param("source", "a, b = map(int, input().split())\nprint(a - b)\n").param("verdict", verdict)
                .param("judgedAt", OffsetDateTime.now(ZoneOffset.UTC))
                .query(Long.class).single();
    }

    private static String analysis(long submissionId) {
        return "/api/submissions/" + submissionId + "/analysis";
    }

    private static RequestPostProcessor as(long id) {
        return SecurityMockMvcRequestPostProcessors.jwt().jwt(jwt -> jwt.subject(String.valueOf(id)));
    }
}
