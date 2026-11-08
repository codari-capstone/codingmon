package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
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
import org.springframework.web.context.WebApplicationContext;

// 실제 PostgreSQL에서 분석 요청·저장·재사용과 힌트 공개를 API로 확인한다(#77). 모델은 가짜다.
// 버려진 PENDING을 빨리 보려고 제한 시간을 1초로 둔다. 처리 중인 시도는 그래도 실패로 보이지 않아야 한다.
@SpringBootTest(properties = "app.llm.pending-timeout=1s")
class AnalysisControllerTest {

    private static final String HINT_1 = "예제 1의 출력과 기대 출력을 비교해 보세요";
    private static final String HINT_2 = "2번 줄의 연산자를 살펴보세요";
    private static final String HINT_3 = "두 수의 합은 a + b로 구합니다";

    // 가짜 모델. answer가 정한 대로 답하고, 부른 횟수와 받은 시스템 지시를 남긴다.
    static class FakeLlm implements LlmClient {

        final AtomicInteger calls = new AtomicInteger();
        final List<String> systems = new CopyOnWriteArrayList<>();
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
            systems.add(request.system());
            return (LlmResponse<T>) answer.get();
        }

        // 3단계 힌트에 코드를 섞은 응답
        static LlmResponse<?> leaking(String principle) {
            AnalysisResult result = new AnalysisResult("두 수를 빼고 있어요", List.of(2), List.of("예제 1에서 3 대신 -1을 출력했어요"),
                    List.of("2번 줄에서 더하기 대신 빼기를 쓴 것 같아요"), new AnalysisResult.Hints(HINT_1, HINT_2, principle));
            return new LlmResponse<>(result, "{\"leaked\": true}", new LlmUsage(100, 50));
        }

        static LlmResponse<?> ok() {
            AnalysisResult result = new AnalysisResult("두 수를 빼고 있어요", List.of(2), List.of("예제 1에서 3 대신 -1을 출력했어요"),
                    List.of("2번 줄에서 더하기 대신 빼기를 쓴 것 같아요"), new AnalysisResult.Hints(HINT_1, HINT_2, HINT_3));
            String json = """
                    {"summary":"두 수를 빼고 있어요","suspectLines":[2],"facts":["예제 1에서 3 대신 -1을 출력했어요"],\
                    "guesses":["2번 줄에서 더하기 대신 빼기를 쓴 것 같아요"],\
                    "hints":{"observation":"%s","direction":"%s","principle":"%s"}}""".formatted(HINT_1, HINT_2, HINT_3);
            return new LlmResponse<>(result, json, new LlmUsage(100, 50));
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
    AiReviewRepository reviews;

    @Autowired
    WebApplicationContext context;

    MockMvc mvc;
    long userId;
    long otherUserId;
    long problemId;
    long versionId;
    // 테스트가 새로 넣은 개념 태그. 원래 있던 태그는 지우지 않는다.
    Long insertedTagId;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(SecurityMockMvcConfigurers.springSecurity()).build();
        llm.calls.set(0);
        llm.systems.clear();
        llm.answer = FakeLlm::ok;
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        userId = user("an-" + suffix);
        otherUserId = user("an2-" + suffix);
        problemId = jdbc.sql("insert into problems (slug) values (:slug) returning id").param("slug", "an-" + suffix)
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
        if (insertedTagId != null) {
            jdbc.sql("delete from concept_tags where id = :id").param("id", insertedTagId).update();
            insertedTagId = null;
        }
    }

    @Test
    void 분석을_만들어_저장하고_다시_요청하면_재사용한다() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        CountDownLatch release = new CountDownLatch(1);
        llm.answer = () -> {
            await(release);
            return FakeLlm.ok();
        };

        mvc.perform(post(analysis(id)).with(as(userId)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.summary").isEmpty())
                .andExpect(jsonPath("$.hints", hasSize(0)));
        // 만드는 중에 또 눌러도 새로 부르지 않는다.
        mvc.perform(post(analysis(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"));
        release.countDown();
        awaitStatus(id, "COMPLETED");

        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.submissionId").value(id))
                .andExpect(jsonPath("$.summary").value("두 수를 빼고 있어요"))
                .andExpect(jsonPath("$.suspectLines[0]").value(2))
                .andExpect(jsonPath("$.facts[0]").value("예제 1에서 3 대신 -1을 출력했어요"))
                .andExpect(jsonPath("$.guesses[0]").value("2번 줄에서 더하기 대신 빼기를 쓴 것 같아요"))
                .andExpect(jsonPath("$.revealedHintLevel").value(0))
                .andExpect(jsonPath("$.hints", hasSize(0)))
                .andExpect(jsonPath("$.completedAt").isNotEmpty())
                // 힌트는 열기 전에는 응답 어디에도 없다.
                .andExpect(content().string(not(containsString(HINT_1))));
        mvc.perform(post(analysis(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        assertThat(llm.calls).hasValue(1);
        assertThat(jdbc.sql("select count(*) from ai_reviews where submission_id = :id").param("id", id)
                .query(Integer.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("select prompt_version || ' ' || model || ' ' || input_tokens from ai_reviews"
                + " where submission_id = :id").param("id", id).query(String.class).single())
                .isEqualTo("v1 fake-model 100");
    }

    @Test
    void 힌트는_한_단계씩_순서대로_열고_못_푼_문제면_통계에_남긴다() throws Exception {
        long id = completedAnalysis();

        hint(id, 2).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("HINT_LEVEL_SKIPPED"));
        hint(id, 1).andExpect(status().isOk())
                .andExpect(jsonPath("$.revealedHintLevel").value(1))
                .andExpect(jsonPath("$.hints", hasSize(1)))
                .andExpect(jsonPath("$.hints[0]").value(HINT_1))
                .andExpect(content().string(not(containsString(HINT_2))));
        // 두 번 눌러도 한 단계만 열린다.
        hint(id, 1).andExpect(status().isOk()).andExpect(jsonPath("$.revealedHintLevel").value(1));
        assertThat(maxHintLevel()).isEqualTo(1);
        hint(id, 2).andExpect(status().isOk()).andExpect(jsonPath("$.hints[1]").value(HINT_2));

        // 제출 기록에서 다시 보면 연 단계까지 그대로다.
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.revealedHintLevel").value(2))
                .andExpect(jsonPath("$.hints", hasSize(2)))
                .andExpect(content().string(not(containsString(HINT_3))));
        assertThat(maxHintLevel()).isEqualTo(2);
        hint(id, 3).andExpect(status().isOk()).andExpect(jsonPath("$.hints[2]").value(HINT_3));
        assertThat(maxHintLevel()).isEqualTo(3);
    }

    @Test
    void 이미_푼_문제에서_연_힌트는_통계에_넣지_않는다() throws Exception {
        long id = completedAnalysis();
        jdbc.sql("update user_problem_stats set solved = true, first_solved_at = now() where user_id = :userId")
                .param("userId", userId).update();

        hint(id, 1).andExpect(status().isOk()).andExpect(jsonPath("$.revealedHintLevel").value(1));

        assertThat(maxHintLevel()).isZero();
    }

    @Test
    void 오답이_아니거나_본인_채점_제출이_아니면_분석하지_않는다() throws Exception {
        long accepted = submission(userId, "SUBMIT", "COMPLETED", "ACCEPTED");
        long judging = submission(userId, "SUBMIT", "RUNNING", null);
        long judgeError = submission(userId, "SUBMIT", "JUDGE_ERROR", null);
        long sampleRun = submission(userId, "SAMPLE_RUN", "COMPLETED", "WRONG_ANSWER");
        long others = submission(otherUserId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");

        for (long id : List.of(accepted, judging, judgeError)) {
            mvc.perform(post(analysis(id)).with(as(userId)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("ANALYSIS_NOT_AVAILABLE"));
        }
        for (long id : List.of(sampleRun, others)) {
            mvc.perform(post(analysis(id)).with(as(userId)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("SUBMISSION_NOT_FOUND"));
        }
        assertThat(llm.calls).hasValue(0);
        assertThat(jdbc.sql("select count(*) from ai_reviews r join submissions s on s.id = r.submission_id"
                + " where s.user_id in (:ids)").param("ids", List.of(userId, otherUserId)).query(Integer.class).single())
                .isZero();
    }

    @Test
    void 남의_분석은_보거나_힌트를_열_수_없다() throws Exception {
        long id = completedAnalysis();
        long noAnalysis = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");

        mvc.perform(get(analysis(id)).with(as(otherUserId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ANALYSIS_NOT_FOUND"));
        mvc.perform(post(analysis(id) + "/hints").with(as(otherUserId)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"level\":1}"))
                .andExpect(status().isNotFound());
        mvc.perform(get(analysis(noAnalysis)).with(as(userId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ANALYSIS_NOT_FOUND"));
        hint(id, 4).andExpect(status().isBadRequest());
        hint(id, 0).andExpect(status().isBadRequest());
        assertThat(maxHintLevel()).isZero();
    }

    @Test
    void 끝나기_전에는_힌트를_열_수_없다() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        CountDownLatch release = new CountDownLatch(1);
        llm.answer = () -> {
            await(release);
            return FakeLlm.ok();
        };
        mvc.perform(post(analysis(id)).with(as(userId))).andExpect(status().isAccepted());

        hint(id, 1).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ANALYSIS_NOT_READY"));

        release.countDown();
        awaitStatus(id, "COMPLETED");
    }

    @Test
    void 실패하면_FAILED로_남고_다시_요청하면_같은_행으로_재시도한다() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        llm.answer = () -> {
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "연결 실패", null, new LlmUsage(10, 0));
        };
        mvc.perform(post(analysis(id)).with(as(userId)));
        awaitStatus(id, "FAILED");
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failureReason").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.summary").isEmpty());

        CountDownLatch release = new CountDownLatch(1);
        llm.answer = () -> {
            await(release);
            return FakeLlm.ok();
        };
        // 다시 시작하면 이전 실패의 이유는 지운다.
        mvc.perform(post(analysis(id)).with(as(userId)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.failureReason").isEmpty())
                .andExpect(jsonPath("$.completedAt").isEmpty());
        release.countDown();
        awaitStatus(id, "COMPLETED");
        mvc.perform(get(analysis(id)).with(as(userId))).andExpect(jsonPath("$.failureReason").isEmpty());

        assertThat(llm.calls).hasValue(2);
        // 같은 행을 다시 썼고, 실패한 시도의 토큰도 더해져 있다.
        assertThat(jdbc.sql("select count(*) || ' ' || sum(input_tokens) from ai_reviews where submission_id = :id")
                .param("id", id).query(String.class).single()).isEqualTo("1 110");
    }

    @Test
    void 오래_끝나지_않은_PENDING은_실패로_보이고_다시_요청할_수_있다() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, created_at)"
                + " values (:id, 'ANALYSIS', 'v1', 'fake-model', now() - interval '1 hour')").param("id", id).update();

        // 서버가 처리 중에 내려간 것이라 장애로 준다. 행에는 이유가 없다(PENDING 그대로).
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failureReason").value("UNAVAILABLE"));
        mvc.perform(post(analysis(id)).with(as(userId)));
        awaitStatus(id, "COMPLETED");

        assertThat(llm.calls).hasValue(1);
    }

    @Test
    void 만들지_못한_이유를_종류별로_준다() throws Exception {
        for (LlmException.Kind kind : List.of(LlmException.Kind.RATE_LIMITED, LlmException.Kind.INVALID_RESPONSE)) {
            long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
            llm.answer = () -> {
                throw new LlmException(kind, "거절", null, LlmUsage.NONE);
            };
            // 가짜 모델이 바로 던지므로 응답하기 전에 FAILED가 저장되면 202가 아니라 200이다.
            mvc.perform(post(analysis(id)).with(as(userId))).andExpect(status().is2xxSuccessful());
            awaitStatus(id, "FAILED");

            mvc.perform(get(analysis(id)).with(as(userId)))
                    .andExpect(jsonPath("$.status").value("FAILED"))
                    .andExpect(jsonPath("$.failureReason").value(kind.name()))
                    // 실패는 하루 한도에 세지 않는다.
                    .andExpect(jsonPath("$.quota.used").value(0));
        }
        // 서버는 장애·429에 스스로 다시 부르지 않는다(가짜 모델이므로 스키마 재요청도 없다).
        assertThat(llm.calls).hasValue(2);
    }

    @Test
    void 다시_시작한_뒤_늦게_끝난_이전_시도는_결과를_덮어쓰지_못한다() {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        AiReviewRepository.Abandoned abandoned = new AiReviewRepository.Abandoned(Duration.ofMinutes(15), Set.of());
        AiReviewRepository.Claim first = reviews.claim(id, ReviewType.ANALYSIS, "v1", "fake-model", abandoned)
                .orElseThrow();
        // 첫 시도가 끝나지 않고 오래되어 다시 시작한 경우
        jdbc.sql("update ai_reviews set created_at = now() - interval '1 hour' where id = :id").param("id", first.id())
                .update();
        AiReviewRepository.Claim second = reviews.claim(id, ReviewType.ANALYSIS, "v1", "fake-model", abandoned)
                .orElseThrow();

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(reviews.complete(first, "{\"summary\":\"이전\"}")).isFalse();
        assertThat(reviews.fail(first, AiReviewRepository.FailureReason.UNAVAILABLE)).isFalse();
        assertThat(reviews.complete(second, "{\"summary\":\"새\"}")).isTrue();
        // 끝났거나 진행 중인 시도가 있으면 새로 시작하지 않는다.
        assertThat(reviews.claim(id, ReviewType.ANALYSIS, "v1", "fake-model", abandoned)).isEmpty();
        assertThat(jdbc.sql("select content->>'summary' from ai_reviews where id = :id").param("id", first.id())
                .query(String.class).single()).isEqualTo("새");
    }

    @Test
    void 이_서버가_처리_중인_분석은_오래_걸려도_실패로_보지_않는다() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        CountDownLatch release = new CountDownLatch(1);
        llm.answer = () -> {
            await(release);
            return FakeLlm.ok();
        };
        mvc.perform(post(analysis(id)).with(as(userId))).andExpect(status().isAccepted());
        // 제한 시간(1초)이 지나도 처리기에 남아 있으면 PENDING이고, 다시 눌러도 또 부르지 않는다.
        Thread.sleep(1_500);

        mvc.perform(get(analysis(id)).with(as(userId))).andExpect(jsonPath("$.status").value("PENDING"));
        mvc.perform(post(analysis(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"));
        release.countDown();
        awaitStatus(id, "COMPLETED");

        assertThat(llm.calls).hasValue(1);
    }

    @Test
    void 새_프롬프트_버전이_실패해도_이전_버전의_분석과_연_힌트를_보여_준다() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, status, content,"
                + " revealed_hint_level, completed_at)"
                + " values (:id, 'ANALYSIS', 'v0', 'old-model', 'COMPLETED', cast(:content as jsonb), 1, now())")
                .param("id", id).param("content", FakeLlm.ok().json()).update();

        // 지금 버전(v1)의 결과가 없으면 이전 버전을 보여 주고, 힌트도 그 결과에 연다.
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.hints", hasSize(1)));
        hint(id, 2).andExpect(status().isOk()).andExpect(jsonPath("$.hints", hasSize(2)));

        llm.answer = () -> {
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "연결 실패", null, LlmUsage.NONE);
        };
        mvc.perform(post(analysis(id)).with(as(userId)));
        awaitVersionStatus(id, "v1", "FAILED");
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.revealedHintLevel").value(2));
        // 실패한 새 버전 대신 이전 버전 결과를 돌려준다(새로 시작하지 못했으므로 200).
        mvc.perform(post(analysis(id)).with(as(userId)));
        awaitVersionStatus(id, "v1", "FAILED");

        llm.answer = FakeLlm::ok;
        mvc.perform(post(analysis(id)).with(as(userId)));
        awaitVersionStatus(id, "v1", "COMPLETED");
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.revealedHintLevel").value(0));
        hint(id, 1).andExpect(status().isOk());
        assertThat(jdbc.sql("select string_agg(prompt_version || '=' || revealed_hint_level, ',' order by prompt_version)"
                + " from ai_reviews where submission_id = :id").param("id", id).query(String.class).single())
                .isEqualTo("v0=2,v1=1");
    }

    @Test
    void 차단된_분석은_내용과_힌트_없이_보여_주고_다시_만들지_않는다() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, status, content, completed_at)"
                + " values (:id, 'ANALYSIS', 'v1', 'fake-model', 'COMPLETED', '{\"blocked\": true}', now())")
                .param("id", id).update();

        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.blocked").value(true))
                .andExpect(jsonPath("$.summary").isEmpty())
                .andExpect(jsonPath("$.hints", hasSize(0)));
        hint(id, 1).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ANALYSIS_BLOCKED"));
        mvc.perform(post(analysis(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocked").value(true));

        assertThat(llm.calls).hasValue(0);
        assertThat(maxHintLevel()).isZero();
    }

    @Test
    void 새_프롬프트_버전이_차단돼도_이전_버전의_분석과_연_힌트를_보여_준다() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, status, content,"
                + " revealed_hint_level, completed_at)"
                + " values (:id, 'ANALYSIS', 'v0', 'old-model', 'COMPLETED', cast(:content as jsonb), 2, now() - interval '1 day')")
                .param("id", id).param("content", FakeLlm.ok().json()).update();
        jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, status, content, completed_at)"
                + " values (:id, 'ANALYSIS', 'v1', 'fake-model', 'COMPLETED', '{\"blocked\": true}', now())")
                .param("id", id).update();

        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.blocked").value(false))
                .andExpect(jsonPath("$.hints", hasSize(2)));
        hint(id, 3).andExpect(status().isOk()).andExpect(jsonPath("$.hints", hasSize(3)));
        assertThat(llm.calls).hasValue(0);
    }

    @Test
    void 차단된_이전_버전이_지금_버전의_실패를_가리지_않는다() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, status, content, completed_at)"
                + " values (:id, 'ANALYSIS', 'v0', 'old-model', 'COMPLETED', '{\"blocked\": true}', now())")
                .param("id", id).update();
        jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, status, failure_reason,"
                + " completed_at) values (:id, 'ANALYSIS', 'v1', 'fake-model', 'FAILED', 'UNAVAILABLE', now())")
                .param("id", id).update();

        // 화면이 재시도 버튼을 보이도록 지금 버전의 FAILED를 준다.
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.blocked").value(false));
        mvc.perform(post(analysis(id)).with(as(userId))).andExpect(status().is2xxSuccessful());
        awaitVersionStatus(id, "v1", "COMPLETED");
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.summary").value("두 수를 빼고 있어요"));
    }

    @Test
    void 결과를_저장하지_못하면_FAILED로_바꿔_다시_요청할_수_있게_한다() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        // JSON으로는 맞지만 PostgreSQL jsonb가 받지 않는 응답
        llm.answer = () -> new LlmResponse<>(FakeLlm.ok().value(), "{\"summary\":\"a\\u0000b\"}", LlmUsage.NONE);

        mvc.perform(post(analysis(id)).with(as(userId)));
        awaitStatus(id, "FAILED");
        mvc.perform(get(analysis(id)).with(as(userId))).andExpect(jsonPath("$.failureReason").value("INTERNAL"));

        llm.answer = FakeLlm::ok;
        mvc.perform(post(analysis(id)).with(as(userId))).andExpect(status().is2xxSuccessful());
        awaitStatus(id, "COMPLETED");
    }

    @Test
    void 정답_코드가_섞이면_지시를_강화해_한_번_다시_만든다() throws Exception {
        jdbc.sql("insert into reference_solutions (problem_version_id, language, solution_role, source_code)"
                + " values (:versionId, 'PYTHON', 'REFERENCE', :code)")
                .param("versionId", versionId)
                .param("code", "a, b = map(int, input().split())\nif a > b: print(a + b)\nelse: print(b + a)\n").update();
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        AtomicInteger answered = new AtomicInteger();
        llm.answer = () -> answered.getAndIncrement() == 0 ? FakeLlm.leaking("if a > b: print(a + b) 처럼 고치세요")
                : FakeLlm.ok();

        mvc.perform(post(analysis(id)).with(as(userId))).andExpect(status().isAccepted());
        awaitStatus(id, "COMPLETED");

        // 다시 만든 결과를 저장하고 보여 준다. 두 호출의 토큰이 같은 행에 더해진다.
        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.blocked").value(false))
                .andExpect(jsonPath("$.summary").value("두 수를 빼고 있어요"));
        hint(id, 1).andExpect(status().isOk());
        assertThat(llm.calls).hasValue(2);
        assertThat(jdbc.sql("select input_tokens from ai_reviews where submission_id = :id").param("id", id)
                .query(Integer.class).single()).isEqualTo(200);
        // 두 번째 요청에만 어긴 규칙과 강화한 지시가 붙는다. 정답 코드 자체는 모델에 보내지 않는다.
        assertThat(llm.systems.getFirst()).doesNotContain("# 다시 쓰기");
        assertThat(llm.systems.get(1)).startsWith(llm.systems.getFirst().strip())
                .contains("# 다시 쓰기", AnswerGuard.Rule.CODE_PATTERN.description,
                        AnswerGuard.Rule.REFERENCE_SIMILAR.description)
                .doesNotContain("print(b + a)");
    }

    @Test
    void 다시_만들어도_섞이면_차단하고_보여_주지_않는다() throws Exception {
        insertedTagId = jdbc.sql("insert into concept_tags (slug, name) values ('test-greedy', '그리디')"
                + " on conflict do nothing returning id").query(Long.class).optional().orElse(null);
        long tagId = jdbc.sql("select id from concept_tags where name = '그리디'").query(Long.class).single();
        jdbc.sql("insert into problem_version_tags (problem_version_id, concept_tag_id) values (:versionId, :tagId)")
                .param("versionId", versionId).param("tagId", tagId).update();
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        llm.answer = () -> FakeLlm.leaking("그리디하게 큰 수부터 고르면 됩니다");

        mvc.perform(post(analysis(id)).with(as(userId))).andExpect(status().isAccepted());
        awaitStatus(id, "COMPLETED");

        mvc.perform(get(analysis(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.blocked").value(true))
                .andExpect(jsonPath("$.summary").isEmpty())
                .andExpect(jsonPath("$.hints", hasSize(0)));
        hint(id, 1).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ANALYSIS_BLOCKED"));
        // 차단된 결과도 재사용한다. 다시 눌러도 모델을 부르지 않는다.
        mvc.perform(post(analysis(id)).with(as(userId))).andExpect(status().isOk());
        assertThat(llm.calls).hasValue(2);
        assertThat(llm.systems.get(1)).contains(AnswerGuard.Rule.ALGORITHM_NAME.description + ": 그리디");
        assertThat(jdbc.sql("select content::text from ai_reviews where submission_id = :id").param("id", id)
                .query(String.class).single()).isEqualTo(AiReviewRunner.BLOCKED_CONTENT);
    }

    private long completedAnalysis() throws Exception {
        long id = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        mvc.perform(post(analysis(id)).with(as(userId)));
        awaitStatus(id, "COMPLETED");
        return id;
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

    private void awaitVersionStatus(long submissionId, String version, String expected) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        String status = null;
        while (System.nanoTime() < deadline) {
            status = jdbc.sql("select status from ai_reviews where submission_id = :id and prompt_version = :version")
                    .param("id", submissionId).param("version", version).query(String.class).optional().orElse(null);
            if (expected.equals(status)) {
                return;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("AI 분석(" + version + ") 상태가 " + expected + "가 되지 않았다: " + status);
    }

    private int maxHintLevel() {
        return jdbc.sql("select max_revealed_hint_level from user_problem_stats where user_id = :userId")
                .param("userId", userId).query(Integer.class).single();
    }

    private long user(String name) {
        return jdbc.sql("insert into users (email, nickname) values (:email, :nickname) returning id")
                .param("email", name + "@test.local").param("nickname", name).query(Long.class).single();
    }

    private long submission(long owner, String kind, String jobStatus, String verdict) {
        boolean judged = "COMPLETED".equals(jobStatus) || "JUDGE_ERROR".equals(jobStatus);
        return jdbc.sql("insert into submissions (user_id, problem_version_id, submission_kind, language, source_code,"
                + " job_status, verdict, judged_at)"
                + " values (:userId, :versionId, :kind, 'PYTHON', :source, :status, :verdict, :judgedAt) returning id")
                .param("userId", owner).param("versionId", versionId).param("kind", kind)
                .param("source", "a, b = map(int, input().split())\nprint(a - b)\n").param("status", jobStatus)
                .param("verdict", verdict).param("judgedAt", judged ? OffsetDateTime.now(ZoneOffset.UTC) : null)
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
