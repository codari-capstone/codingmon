package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

// 실제 PostgreSQL에서 학습 리포트(F4) 만들기·저장·재사용·재시도를 API로 확인한다(#85). 모델은 가짜다.
// 개념 태그 하나(취약)에 낸 문제 6개(5개 맞힘, 1개 틀림)를 둔다. 통계는 6문제 중 5, 해결률 83%, 평균 1.33번, 힌트 0.33이다.
// 추천 후보는 그 태그의 아직 맞히지 않은 문제 2개(틀린 문제 포함)와 태그 없는 MEDIUM 문제 1개라, 1·2위는 그 태그이고 3위는 도전 문제다.
// 버려진 PENDING을 빨리 보려고 제한 시간을 1초로 둔다.
@SpringBootTest(properties = "app.llm.pending-timeout=1s")
class LearningReportControllerTest {

    private static final String PATH = "/api/users/me/learning-report";

    // 가짜 모델. answer가 정한 대로 답하고 부른 횟수를 센다. 기본은 입력의 취약 개념·순위에 맞춘 정상 응답이다.
    static class FakeLlm implements LlmClient {

        final AtomicInteger calls = new AtomicInteger();
        volatile Function<LlmRequest<?>, LlmResponse<?>> answer;

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
            return (LlmResponse<T>) answer.apply(request);
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
    WebApplicationContext context;

    MockMvc mvc;
    long userId;
    long shortUserId;
    long tagId;
    String tagName;
    long wrongProblemId;
    long freshProblemId;
    long challengeProblemId;
    final List<Long> problemIds = new ArrayList<>();

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(SecurityMockMvcConfigurers.springSecurity()).build();
        llm.calls.set(0);
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        // 개념 이름에 숫자가 섞여도 수치 대조는 이름을 가리고 본다.
        tagName = "반복 범위 " + suffix;
        llm.answer = request -> answer(request, tagName, "반복 범위는 반복이 끝나는 값을 정하는 개념이에요. 해결률 83%로 잘하고 있어요.");
        userId = user("lr-" + suffix);
        shortUserId = user("lr2-" + suffix);
        tagId = jdbc.sql("insert into concept_tags (slug, name) values (:slug, :name) returning id")
                .param("slug", "lr-" + suffix).param("name", tagName).query(Long.class).single();
        for (int i = 1; i <= 5; i++) {
            long solved = problem("맞힌 문제 " + i, "EASY", tagId);
            stats(userId, solved, true, 1, 0);
        }
        wrongProblemId = problem("틀린 문제", "EASY", tagId);
        stats(userId, wrongProblemId, false, 3, 2);
        freshProblemId = problem("새 문제", "EASY", tagId);
        challengeProblemId = problem("도전 문제", "MEDIUM", null);
        // 2문제만 맞힌 사용자
        stats(shortUserId, problemIds.get(0), true, 1, 0);
        stats(shortUserId, problemIds.get(1), true, 1, 0);
    }

    @AfterEach
    void tearDown() {
        // 사용자를 지우면 풀이 통계와 리포트(추천 행 포함)가 함께 지워진다.
        jdbc.sql("delete from users where id in (:ids)").param("ids", List.of(userId, shortUserId)).update();
        jdbc.sql("delete from problem_versions where problem_id in (:ids)").param("ids", problemIds).update();
        jdbc.sql("delete from problems where id in (:ids)").param("ids", problemIds).update();
        jdbc.sql("delete from concept_tags where id = :id").param("id", tagId).update();
        problemIds.clear();
    }

    @Test
    void 만들기_시작하면_서버_값을_먼저_주고_끝나면_문장을_붙인다() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        Function<LlmRequest<?>, LlmResponse<?>> normal = llm.answer;
        llm.answer = request -> {
            await(release);
            return normal.apply(request);
        };

        mvc.perform(post(PATH).with(as(userId)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.failureReason").isEmpty())
                .andExpect(jsonPath("$.summary").isEmpty())
                .andExpect(jsonPath("$.solvedProblemCount").value(5))
                .andExpect(jsonPath("$.concepts", hasSize(1)))
                .andExpect(jsonPath("$.concepts[0].name").value(tagName))
                .andExpect(jsonPath("$.concepts[0].solveRate").value(0.83))
                .andExpect(jsonPath("$.concepts[0].weak").value(true))
                .andExpect(jsonPath("$.weakConcepts", hasSize(1)))
                .andExpect(jsonPath("$.weakConcepts[0].explanation").isEmpty())
                .andExpect(jsonPath("$.recommendations", hasSize(3)))
                .andExpect(jsonPath("$.recommendations[0].reason").isEmpty());
        // 만드는 중에 또 눌러도 새로 부르지 않는다.
        mvc.perform(post(PATH).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"));
        mvc.perform(get(PATH).with(as(userId)))
                .andExpect(jsonPath("$.status").value("PENDING"));
        release.countDown();
        awaitStatus("COMPLETED");

        mvc.perform(get(PATH).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.generatedAt").isNotEmpty())
                .andExpect(jsonPath("$.reportDate").isNotEmpty())
                .andExpect(jsonPath("$.summary").value("5문제를 맞혔어요. 다음 문제로 이어 가 봐요."))
                .andExpect(jsonPath("$.weakConcepts[0].slug").isNotEmpty())
                .andExpect(jsonPath("$.weakConcepts[0].name").value(tagName))
                .andExpect(jsonPath("$.weakConcepts[0].explanation")
                        .value("반복 범위는 반복이 끝나는 값을 정하는 개념이에요. 해결률 83%로 잘하고 있어요."))
                .andExpect(jsonPath("$.weakConcepts[0].practice").value("작은 입력으로 한 줄씩 따라가 보세요."))
                // 추천은 그 태그의 쉬운 문제를 번호 순으로 2개, 남은 자리는 도전 문제다. 틀린 문제는 WRONG이다.
                .andExpect(jsonPath("$.recommendations[0].rank").value(1))
                .andExpect(jsonPath("$.recommendations[0].problemId").value(wrongProblemId))
                .andExpect(jsonPath("$.recommendations[0].title").value("틀린 문제"))
                .andExpect(jsonPath("$.recommendations[0].difficulty").value("EASY"))
                .andExpect(jsonPath("$.recommendations[0].concept.name").value(tagName))
                .andExpect(jsonPath("$.recommendations[0].concept.weaknessScore").value(0.13))
                .andExpect(jsonPath("$.recommendations[0].solveStatus").value("WRONG"))
                .andExpect(jsonPath("$.recommendations[0].reason").value("1위 문제로 다시 도전해 봐요."))
                .andExpect(jsonPath("$.recommendations[1].problemId").value(freshProblemId))
                .andExpect(jsonPath("$.recommendations[1].solveStatus").value("UNSOLVED"))
                .andExpect(jsonPath("$.recommendations[2].concept").isEmpty())
                .andExpect(jsonPath("$.recommendations[2].difficulty").value("MEDIUM"))
                // 대조 내역은 저장만 하고 주지 않는다.
                .andExpect(jsonPath("$.numberCheck").doesNotExist());
        // 같은 날 다시 누르면 저장된 리포트를 준다.
        mvc.perform(post(PATH).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        assertThat(llm.calls).hasValue(1);
        assertThat(jdbc.sql("select prompt_version || ' ' || model || ' ' || input_tokens || ' ' || output_tokens"
                + " || ' ' || (content -> 'numberCheck' ->> 'removed') from learning_reports where user_id = :userId")
                .param("userId", userId).query(String.class).single()).isEqualTo("v1 fake-model 100 50 0");
    }

    @Test
    void 통계와_맞지_않는_수치를_쓴_문장은_지우고_화면_수치는_서버_값이다() throws Exception {
        // 해결률은 83%이고 평균 시도는 1.33번이다. 50%, 2.5번, 4번은 입력에 없다.
        llm.answer = request -> answer(request, tagName, "해결률이 50%예요. 평균 2.5번 시도했어요.", "평균 4번 시도한 문제예요.");

        mvc.perform(post(PATH).with(as(userId))).andExpect(status().isAccepted());
        awaitStatus("COMPLETED");

        mvc.perform(get(PATH).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.weakConcepts[0].explanation").isEmpty())
                .andExpect(jsonPath("$.weakConcepts[0].practice").value("작은 입력으로 한 줄씩 따라가 보세요."))
                // 이유가 모두 지워진 추천도 문제는 그대로 보인다.
                .andExpect(jsonPath("$.recommendations[0].problemId").value(wrongProblemId))
                .andExpect(jsonPath("$.recommendations[0].reason").isEmpty())
                .andExpect(jsonPath("$.recommendations[1].reason").value("이어서 연습해요."))
                .andExpect(jsonPath("$.concepts[0].solveRate").value(0.83))
                .andExpect(jsonPath("$.concepts[0].averageAttempts").value(1.33));
        assertThat(jdbc.sql("select content -> 'numberCheck' ->> 'fixes' from learning_reports where user_id = :userId")
                .param("userId", userId).query(String.class).single())
                .isEqualTo("[\"PERCENT@weakConcepts[0].explanation\", \"NUMBER@weakConcepts[0].explanation\","
                        + " \"NUMBER@recommendations[0].reason\"]");
    }

    @Test
    void 맞힌_문제가_5개_미만이면_만들지_않고_더_맞힐_개수를_준다() throws Exception {
        mvc.perform(post(PATH).with(as(shortUserId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LEARNING_REPORT_NOT_AVAILABLE"))
                .andExpect(jsonPath("$.detail").value("3문제 더 맞히면 리포트를 볼 수 있어요"))
                .andExpect(jsonPath("$.remainingProblemCount").value(3));
        mvc.perform(get(PATH).with(as(shortUserId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("LEARNING_REPORT_NOT_FOUND"));

        assertThat(llm.calls).hasValue(0);
        assertThat(reportCount(shortUserId)).isZero();
    }

    @Test
    void 만들지_못하면_FAILED이고_다음_요청에서_통계와_추천을_다시_계산해_만든다() throws Exception {
        llm.answer = request -> {
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "모델 서버가 꺼져 있다", null, new LlmUsage(10, 0));
        };
        mvc.perform(post(PATH).with(as(userId))).andExpect(status().isAccepted());
        awaitStatus("FAILED");
        mvc.perform(get(PATH).with(as(userId)))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failureReason").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.summary").isEmpty())
                // 통계와 추천은 AI가 실패해도 보인다.
                .andExpect(jsonPath("$.recommendations", hasSize(3)))
                .andExpect(jsonPath("$.recommendations[0].problemId").value(wrongProblemId));

        // 그사이 틀린 문제를 맞혔다. 다시 만들 때 통계와 추천이 지금 기준으로 바뀐다.
        jdbc.sql("update user_problem_stats set solved = true, first_solved_at = now() where user_id = :userId"
                + " and problem_id = :problemId").param("userId", userId).param("problemId", wrongProblemId).update();
        llm.answer = request -> answer(request, tagName, "반복 범위는 반복이 끝나는 값을 정하는 개념이에요.");
        mvc.perform(post(PATH).with(as(userId)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.failureReason").isEmpty())
                .andExpect(jsonPath("$.solvedProblemCount").value(6))
                .andExpect(jsonPath("$.recommendations[0].problemId").value(freshProblemId))
                .andExpect(jsonPath("$.recommendations", hasSize(2)));
        awaitStatus("COMPLETED");

        assertThat(llm.calls).hasValue(2);
        assertThat(reportCount(userId)).isEqualTo(1);
        // 실패한 시도의 토큰도 남는다.
        assertThat(jdbc.sql("select input_tokens from learning_reports where user_id = :userId").param("userId", userId)
                .query(Integer.class).single()).isEqualTo(110);
    }

    @Test
    void 입력과_맞출_수_없는_응답은_INVALID_RESPONSE로_실패한다() throws Exception {
        // 순위 1을 세 번 쓴 응답. 스키마는 개수와 값만 묶어서 되풀이는 서버가 본다.
        llm.answer = request -> new LlmResponse<>(new LearningReportResult(
                List.of(new LearningReportResult.WeakConcept(tagName, "설명이에요.", "연습해요.")),
                List.of(new LearningReportResult.RecommendationReason(1, "이유"),
                        new LearningReportResult.RecommendationReason(1, "이유"),
                        new LearningReportResult.RecommendationReason(1, "이유")), "요약이에요."), "{}", LlmUsage.NONE);

        mvc.perform(post(PATH).with(as(userId))).andExpect(status().isAccepted());
        awaitStatus("FAILED");

        mvc.perform(get(PATH).with(as(userId)))
                .andExpect(jsonPath("$.failureReason").value("INVALID_RESPONSE"));
    }

    @Test
    void 처리_중에_서버가_내려가_남은_PENDING은_FAILED로_보이고_다시_만들_수_있다() throws Exception {
        // 처리기에 없는 PENDING 행. 제한 시간(1초)이 지나 버려진 것으로 보인다.
        long reportId = jdbc.sql("insert into learning_reports (user_id, report_date, statistics, generated_at)"
                + " values (:userId, (now() at time zone 'UTC')::date, cast(:stats as jsonb), now() - interval '1 minute')"
                + " returning id")
                .param("userId", userId)
                .param("stats", "{\"solvedProblemCount\":5,\"requiredProblemCount\":5,\"remainingProblemCount\":0,"
                        + "\"concepts\":[]}")
                .query(Long.class).single();

        mvc.perform(get(PATH).with(as(userId)))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failureReason").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.recommendations", hasSize(0)));
        mvc.perform(post(PATH).with(as(userId)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.recommendations", hasSize(3)));
        awaitStatus("COMPLETED");

        assertThat(jdbc.sql("select id from learning_reports where user_id = :userId").param("userId", userId)
                .query(Long.class).single()).isEqualTo(reportId);
    }

    @Test
    void 오늘_리포트가_없으면_지난_리포트를_보여_주고_새로_누르면_오늘_것을_만든다() throws Exception {
        mvc.perform(get(PATH).with(as(userId))).andExpect(status().isNotFound());
        mvc.perform(post(PATH).with(as(userId))).andExpect(status().isAccepted());
        awaitStatus("COMPLETED");
        jdbc.sql("update learning_reports set report_date = report_date - 1 where user_id = :userId")
                .param("userId", userId).update();
        String yesterday = jdbc.sql("select report_date::text from learning_reports where user_id = :userId")
                .param("userId", userId).query(String.class).single();

        mvc.perform(get(PATH).with(as(userId)))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.reportDate").value(yesterday));
        mvc.perform(post(PATH).with(as(userId))).andExpect(status().isAccepted());
        awaitStatus("COMPLETED");

        assertThat(reportCount(userId)).isEqualTo(2);
        assertThat(llm.calls).hasValue(2);
        mvc.perform(get(PATH).with(as(userId)))
                .andExpect(jsonPath("$.reportDate").value(org.hamcrest.Matchers.not(yesterday)));
    }

    @Test
    void 추천_문제의_풀이_상태는_보여_줄_때의_것이다() throws Exception {
        mvc.perform(post(PATH).with(as(userId))).andExpect(status().isAccepted());
        awaitStatus("COMPLETED");
        jdbc.sql("insert into user_problem_stats (user_id, problem_id, attempt_count, solved, first_solved_at)"
                + " values (:userId, :problemId, 1, true, now())").param("userId", userId)
                .param("problemId", freshProblemId).update();

        mvc.perform(get(PATH).with(as(userId)))
                .andExpect(jsonPath("$.recommendations[1].problemId").value(freshProblemId))
                .andExpect(jsonPath("$.recommendations[1].solveStatus").value("SOLVED"))
                // 리포트의 통계는 만들 때의 것이라 그대로다.
                .andExpect(jsonPath("$.solvedProblemCount").value(5));
    }

    @Test
    void 동시에_눌러도_한_번만_만든다() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        Function<LlmRequest<?>, LlmResponse<?>> normal = llm.answer;
        llm.answer = request -> {
            await(release);
            return normal.apply(request);
        };
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return mvc.perform(post(PATH).with(as(userId))).andReturn().getResponse().getStatus();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) {
                statuses.add(result.get(10, TimeUnit.SECONDS));
            }
            assertThat(statuses).containsExactlyInAnyOrder(202, 200);
        } finally {
            release.countDown();
            pool.shutdown();
        }
        awaitStatus("COMPLETED");

        assertThat(llm.calls).hasValue(1);
        assertThat(reportCount(userId)).isEqualTo(1);
    }

    // 입력의 취약 개념(이 테스트에서는 하나)과 추천 순위에 맞춘 응답. 순위는 입력마다 만드는 스키마의 enum에서 읽는다
    // (다시 만들 때 추천이 줄 수 있다).
    private static LlmResponse<?> answer(LlmRequest<?> request, String concept, String explanation) {
        return answer(request, concept, explanation, "1위 문제로 다시 도전해 봐요.");
    }

    @SuppressWarnings("unchecked")
    private static LlmResponse<?> answer(LlmRequest<?> request, String concept, String explanation, String firstReason) {
        Map<String, Object> recommendations = (Map<String, Object>) ((Map<String, Object>) request.schema()
                .get("properties")).get("recommendations");
        Map<String, Object> rank = (Map<String, Object>) ((Map<String, Object>) ((Map<String, Object>) recommendations
                .get("items")).get("properties")).get("rank");
        List<LearningReportResult.RecommendationReason> reasons = ((List<Integer>) rank.get("enum")).stream()
                .map(r -> new LearningReportResult.RecommendationReason(r, r == 1 ? firstReason : "이어서 연습해요."))
                .toList();
        LearningReportResult result = new LearningReportResult(
                List.of(new LearningReportResult.WeakConcept(concept, explanation, "작은 입력으로 한 줄씩 따라가 보세요.")),
                reasons, "5문제를 맞혔어요. 다음 문제로 이어 가 봐요.");
        return new LlmResponse<>(result, "{}", new LlmUsage(100, 50));
    }

    private int reportCount(long owner) {
        return jdbc.sql("select count(*) from learning_reports where user_id = :userId").param("userId", owner)
                .query(Integer.class).single();
    }

    // 오늘 리포트의 상태를 기다린다.
    private void awaitStatus(String expected) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        String status = null;
        while (System.nanoTime() < deadline) {
            status = jdbc.sql("select status from learning_reports where user_id = :userId"
                    + " and report_date = (now() at time zone 'UTC')::date").param("userId", userId)
                    .query(String.class).optional().orElse(null);
            if (expected.equals(status)) {
                return;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("리포트 상태가 " + expected + "가 되지 않았다: " + status);
    }

    private long user(String name) {
        return jdbc.sql("insert into users (email, nickname) values (:email, :nickname) returning id")
                .param("email", name + "@test.local").param("nickname", name).query(Long.class).single();
    }

    // 공개한 문제 하나. tag가 null이면 태그가 없다.
    private long problem(String title, String difficulty, Long tag) {
        long id = jdbc.sql("insert into problems (slug) values (:slug) returning id")
                .param("slug", "lr-" + UUID.randomUUID().toString().substring(0, 12)).query(Long.class).single();
        long versionId = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty,"
                + " statement_markdown, input_description, output_description, status, published_at)"
                + " values (:id, 1, :title, :difficulty, '지문', '입력', '출력', 'PUBLISHED', now()) returning id")
                .param("id", id).param("title", title).param("difficulty", difficulty).query(Long.class).single();
        if (tag != null) {
            jdbc.sql("insert into problem_version_tags (problem_version_id, concept_tag_id) values (:versionId, :tagId)")
                    .param("versionId", versionId).param("tagId", tag).update();
        }
        problemIds.add(id);
        return id;
    }

    private void stats(long owner, long problemId, boolean solved, int attempts, int hint) {
        jdbc.sql("insert into user_problem_stats (user_id, problem_id, solved, first_solved_at, attempt_count,"
                + " max_revealed_hint_level) values (:userId, :problemId, :solved, case when :solved then now() end,"
                + " :attempts, :hint)")
                .param("userId", owner).param("problemId", problemId).param("solved", solved)
                .param("attempts", attempts).param("hint", hint).update();
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
