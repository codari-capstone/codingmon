package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.function.Supplier;

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
import org.springframework.web.ErrorResponseException;
import org.springframework.web.context.WebApplicationContext;

// 실제 PostgreSQL에서 AI 코드 리뷰(F3) 요청·저장·재사용, 정답 코드 검사, 분석과 합친 하루 한도를 API로 확인한다(#82). 모델은 가짜다.
// 리뷰와 함께 저장하는 다음 개념(ai_review_next_concepts, #83)도 여기서 본다. 매칭 규칙은 ConceptTagMatcherTest가 본다.
// 버려진 PENDING을 빨리 보려고 제한 시간을 1초로, 한도를 넘기기 쉽게 하루 한도를 3회로 둔다.
@SpringBootTest(properties = { "app.llm.pending-timeout=1s", "app.llm.daily-limit=3" })
class CodeReviewControllerTest {

    private static final String SOURCE = "n = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total = total + i * i\n"
            + "print(total)\n";

    // 가짜 모델. answer가 정한 대로 답하고, 부른 횟수와 받은 시스템 지시를 남긴다. 기본은 요청 종류(분석·리뷰)에 맞는 정상 응답이다.
    static class FakeLlm implements LlmClient {

        final AtomicInteger calls = new AtomicInteger();
        final List<String> systems = new CopyOnWriteArrayList<>();
        volatile Function<LlmRequest<?>, LlmResponse<?>> answer = FakeLlm::ok;

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
            return (LlmResponse<T>) answer.apply(request);
        }

        static LlmResponse<?> ok(LlmRequest<?> request) {
            return request.responseType() == CodeReviewResult.class ? review("변수 total의 이름을 더 분명하게 지으면 좋아요.")
                    : analysis();
        }

        static Function<LlmRequest<?>, LlmResponse<?>> always(Supplier<LlmResponse<?>> response) {
            return request -> response.get();
        }

        // 개선점 하나를 바꾼 리뷰. 코드를 섞은 응답도 이것으로 만든다.
        static LlmResponse<?> review(String improvement) {
            return reviewWith(improvement, "수열의 합 공식");
        }

        static LlmResponse<?> reviewWith(String improvement, String concept) {
            CodeReviewResult result = new CodeReviewResult("반복문으로 제곱의 합을 정확하게 구했어요.",
                    new CodeReviewResult.Complexity("3번 줄의 반복이 n번 돕니다.", "O(n)", "O(1)", "O(1)",
                            "n ≤ 1,000,000이면 약 100만 번이라 시간 안에 들어오지만, 식 하나로 구할 수 있어 의도한 복잡도는 O(1)로 추정돼요.",
                            false),
                    List.of(improvement), List.of(new CodeReviewResult.Concept(concept, "반복 없이 식 하나로 합을 구할 수 있어요.")));
            String json = """
                    {"summary":"반복문으로 제곱의 합을 정확하게 구했어요.",\
                    "complexity":{"basis":"3번 줄의 반복이 n번 돕니다.","time":"O(n)","space":"O(1)","intendedTime":"O(1)",\
                    "comparison":"식 하나로 구할 수 있어요.","meetsIntended":false},\
                    "improvements":["%s"],"nextConcepts":[{"name":"%s","reason":"반복 없이 식 하나로 합을 구할 수 있어요."}]}"""
                    .formatted(improvement, concept);
            return new LlmResponse<>(result, json, new LlmUsage(100, 50));
        }

        static LlmResponse<?> analysis() {
            AnalysisResult result = new AnalysisResult("두 수를 빼고 있어요", List.of(2), List.of("예제 1에서 3 대신 -1을 출력했어요"),
                    List.of("2번 줄에서 더하기 대신 빼기를 쓴 것 같아요"), new AnalysisResult.Hints("힌트 1", "힌트 2", "힌트 3"));
            return new LlmResponse<>(result, "{\"summary\":\"두 수를 빼고 있어요\"}", new LlmUsage(100, 50));
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
    CodeReviewService codeReviews;

    @Autowired
    AnalysisService analyses;

    @Autowired
    NextConceptRepository nextConcepts;

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
        userId = user("cr-" + suffix);
        otherUserId = user("cr2-" + suffix);
        problemId = jdbc.sql("insert into problems (slug) values (:slug) returning id").param("slug", "cr-" + suffix)
                .query(Long.class).single();
        versionId = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty, statement_markdown,"
                + " input_description, output_description, constraints_markdown) values (:problemId, 1, '제곱수의 합', 'EASY',"
                + " '1부터 N까지 제곱의 합', 'N', '합', '1 ≤ N ≤ 1,000,000') returning id")
                .param("problemId", problemId).query(Long.class).single();
        jdbc.sql("insert into problem_language_configs (problem_version_id, language, time_limit_ms, memory_limit_mb)"
                + " values (:versionId, 'PYTHON', 1000, 128)").param("versionId", versionId).update();
        jdbc.sql("insert into user_problem_stats (user_id, problem_id, attempt_count, solved, first_solved_at)"
                + " values (:userId, :problemId, 1, true, now())").param("userId", userId).param("problemId", problemId).update();
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
    void 정답_제출을_리뷰해_저장하고_다시_요청하면_재사용한다() throws Exception {
        long id = accepted(userId);
        CountDownLatch release = new CountDownLatch(1);
        llm.answer = request -> {
            await(release);
            return FakeLlm.ok(request);
        };

        mvc.perform(post(review(id)).with(as(userId)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.summary").isEmpty())
                .andExpect(jsonPath("$.complexity").isEmpty())
                .andExpect(jsonPath("$.improvements", hasSize(0)))
                .andExpect(jsonPath("$.quota.used").value(1));
        // 만드는 중에 또 눌러도 새로 부르지 않고 세지도 않는다.
        mvc.perform(post(review(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.quota.used").value(1));
        release.countDown();
        awaitStatus(id, "COMPLETED");

        mvc.perform(get(review(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.submissionId").value(id))
                .andExpect(jsonPath("$.blocked").value(false))
                .andExpect(jsonPath("$.summary").value("반복문으로 제곱의 합을 정확하게 구했어요."))
                .andExpect(jsonPath("$.complexity.basis").value("3번 줄의 반복이 n번 돕니다."))
                .andExpect(jsonPath("$.complexity.time").value("O(n)"))
                .andExpect(jsonPath("$.complexity.intendedTime").value("O(1)"))
                .andExpect(jsonPath("$.complexity.meetsIntended").value(false))
                .andExpect(jsonPath("$.improvements[0]").value("변수 total의 이름을 더 분명하게 지으면 좋아요."))
                .andExpect(jsonPath("$.nextConcepts[0].name").value("수열의 합 공식"))
                .andExpect(jsonPath("$.nextConcepts[0].reason").isNotEmpty())
                .andExpect(jsonPath("$.completedAt").isNotEmpty())
                .andExpect(jsonPath("$.quota.limit").value(3))
                .andExpect(jsonPath("$.quota.remaining").value(2));
        mvc.perform(post(review(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        assertThat(llm.calls).hasValue(1);
        assertThat(jdbc.sql("select review_type || ' ' || prompt_version || ' ' || model || ' ' || input_tokens || ' '"
                + " || revealed_hint_level from ai_reviews where submission_id = :id").param("id", id)
                .query(String.class).single()).isEqualTo("CODE_REVIEW v1 fake-model 100 0");
        // 다음 개념은 맞는 태그가 없어도 원문으로 한 벌 저장되고, 재사용해도 늘지 않는다. 학습 리포트가 이것을 읽는다.
        assertThat(concepts(id)).containsExactly("1 수열의 합 공식 -");
        assertThat(nextConcepts.findRecent(userId, 1)).singleElement().satisfies(concept -> {
            assertThat(concept.submissionId()).isEqualTo(id);
            assertThat(concept.problemTitle()).isEqualTo("제곱수의 합");
            assertThat(concept.reason()).isEqualTo("반복 없이 식 하나로 합을 구할 수 있어요.");
            assertThat(concept.tag()).isNull();
        });
        // 리뷰는 힌트 통계를 건드리지 않는다.
        assertThat(jdbc.sql("select max_revealed_hint_level from user_problem_stats where user_id = :userId")
                .param("userId", userId).query(Integer.class).single()).isZero();
    }

    @Test
    void 정답이_아니거나_본인_채점_제출이_아니면_리뷰하지_않는다() throws Exception {
        long wrong = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        long judging = submission(userId, "SUBMIT", "RUNNING", null);
        long judgeError = submission(userId, "SUBMIT", "JUDGE_ERROR", null);
        long sampleRun = submission(userId, "SAMPLE_RUN", "COMPLETED", "ACCEPTED");
        long others = accepted(otherUserId);

        for (long id : List.of(wrong, judging, judgeError)) {
            mvc.perform(post(review(id)).with(as(userId)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("CODE_REVIEW_NOT_AVAILABLE"))
                    .andExpect(jsonPath("$.detail").value("정답 판정을 받은 제출만 리뷰할 수 있어요"));
        }
        for (long id : List.of(sampleRun, others)) {
            mvc.perform(post(review(id)).with(as(userId)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("SUBMISSION_NOT_FOUND"));
        }
        assertThat(llm.calls).hasValue(0);
        assertThat(jdbc.sql("select count(*) from ai_reviews r join submissions s on s.id = r.submission_id"
                + " where s.user_id in (:ids)").param("ids", List.of(userId, otherUserId)).query(Integer.class).single())
                .isZero();
    }

    @Test
    void 남의_리뷰나_요청하지_않은_리뷰는_볼_수_없다() throws Exception {
        long id = completedReview();
        long noReview = accepted(userId);
        // 같은 제출에 다른 종류(분석) 행이 있어도 리뷰로 보지 않는다.
        jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, status, content, completed_at)"
                + " values (:id, 'ANALYSIS', 'v1', 'fake-model', 'COMPLETED', '{\"summary\":\"분석\"}', now())")
                .param("id", noReview).update();

        mvc.perform(get(review(id)).with(as(otherUserId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CODE_REVIEW_NOT_FOUND"));
        mvc.perform(get(review(noReview)).with(as(userId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CODE_REVIEW_NOT_FOUND"));
        mvc.perform(get(review(id)).with(as(userId))).andExpect(status().isOk());
    }

    @Test
    void 실패하면_FAILED로_남고_다시_요청하면_같은_행으로_재시도한다() throws Exception {
        long id = accepted(userId);
        llm.answer = request -> {
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "연결 실패", null, new LlmUsage(10, 0));
        };
        mvc.perform(post(review(id)).with(as(userId)));
        awaitStatus(id, "FAILED");
        // 실패는 하루 한도에 세지 않는다.
        mvc.perform(get(review(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failureReason").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.complexity").isEmpty())
                .andExpect(jsonPath("$.quota.used").value(0));

        llm.answer = FakeLlm::ok;
        mvc.perform(post(review(id)).with(as(userId))).andExpect(status().is2xxSuccessful());
        awaitStatus(id, "COMPLETED");
        mvc.perform(get(review(id)).with(as(userId))).andExpect(jsonPath("$.failureReason").isEmpty());

        assertThat(llm.calls).hasValue(2);
        // 같은 행을 다시 썼고, 실패한 시도의 토큰도 더해져 있다.
        assertThat(jdbc.sql("select count(*) || ' ' || sum(input_tokens) from ai_reviews where submission_id = :id")
                .param("id", id).query(String.class).single()).isEqualTo("1 110");
        assertThat(concepts(id)).containsExactly("1 수열의 합 공식 -");
    }

    @Test
    void 다음_개념을_저장하지_못하면_결과도_저장하지_않고_FAILED가_된다() throws Exception {
        long id = accepted(userId);
        // 모델 응답은 스키마가 개념을 3개로 막지만 가짜 모델은 검증을 거치지 않는다. 4개를 넘겨 표의 CHECK(ordinal 1~3)에 걸리게 한다.
        // 결과(content)는 정상 JSON이라 저장할 수 있지만 같은 트랜잭션이라 함께 롤백되어야 한다.
        llm.answer = FakeLlm.always(() -> {
            LlmResponse<?> ok = FakeLlm.review("변수 total의 이름을 더 분명하게 지으면 좋아요.");
            CodeReviewResult result = (CodeReviewResult) ok.value();
            return new LlmResponse<>(new CodeReviewResult(result.summary(), result.complexity(), result.improvements(),
                    Collections.nCopies(4, result.nextConcepts().getFirst())), ok.json(), ok.usage());
        });

        mvc.perform(post(review(id)).with(as(userId))).andExpect(status().is2xxSuccessful());
        awaitStatus(id, "FAILED");

        assertThat(jdbc.sql("select content is null from ai_reviews where submission_id = :id").param("id", id)
                .query(Boolean.class).single()).isTrue();
        assertThat(concepts(id)).isEmpty();
        // 결과 저장 실패라 그 밖의 서버 오류로 보인다(AI_FEATURES 8절)
        mvc.perform(get(review(id)).with(as(userId))).andExpect(jsonPath("$.failureReason").value("INTERNAL"));
        // 실패한 행이라 다시 요청할 수 있다.
        llm.answer = FakeLlm::ok;
        mvc.perform(post(review(id)).with(as(userId))).andExpect(status().is2xxSuccessful());
        awaitStatus(id, "COMPLETED");
        assertThat(concepts(id)).containsExactly("1 수열의 합 공식 -");
    }

    @Test
    void 오래_끝나지_않은_PENDING은_실패로_보이고_다시_요청할_수_있다() throws Exception {
        long id = accepted(userId);
        jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, created_at)"
                + " values (:id, 'CODE_REVIEW', 'v1', 'fake-model', now() - interval '1 hour')").param("id", id).update();

        mvc.perform(get(review(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.failureReason").value("UNAVAILABLE"));
        mvc.perform(post(review(id)).with(as(userId)));
        awaitStatus(id, "COMPLETED");

        assertThat(llm.calls).hasValue(1);
    }

    @Test
    void 정답_코드가_섞이면_지시를_강화해_한_번_다시_만든다() throws Exception {
        // 학습자와 다른 정답 코드(while 반복). 첫 응답이 이 코드의 조각을 옮겨 정답 코드 조각 검사(REFERENCE_SIMILAR)에 걸린다.
        jdbc.sql("insert into reference_solutions (problem_version_id, language, solution_role, source_code)"
                + " values (:versionId, 'PYTHON', 'REFERENCE', :code)")
                .param("versionId", versionId)
                .param("code", "n = int(input())\ntotal = 0\ni = 1\nwhile i <= n:\n    total += i * i\n    i += 1\nprint(total)\n")
                .update();
        long id = accepted(userId);
        AtomicInteger answered = new AtomicInteger();
        llm.answer = request -> answered.getAndIncrement() == 0
                ? FakeLlm.reviewWith("3번 줄부터 while i <= n: total += i * i 처럼 바꾸세요.", "첫 응답의 개념")
                : FakeLlm.ok(request);

        mvc.perform(post(review(id)).with(as(userId))).andExpect(status().is2xxSuccessful());
        awaitStatus(id, "COMPLETED");

        mvc.perform(get(review(id)).with(as(userId)))
                .andExpect(jsonPath("$.blocked").value(false))
                .andExpect(jsonPath("$.improvements[0]").value("변수 total의 이름을 더 분명하게 지으면 좋아요."))
                .andExpect(jsonPath("$.quota.used").value(1));
        assertThat(llm.calls).hasValue(2);
        assertThat(jdbc.sql("select input_tokens from ai_reviews where submission_id = :id").param("id", id)
                .query(Integer.class).single()).isEqualTo(200);
        // 다음 개념도 검사를 통과한 두 번째 응답의 것만 남는다.
        assertThat(concepts(id)).containsExactly("1 수열의 합 공식 -");
        // 두 번째 요청에만 어긴 규칙과 강화한 지시가 붙는다. 정답 코드 자체는 모델에 보내지 않는다.
        assertThat(llm.systems.getFirst()).doesNotContain("# 다시 쓰기");
        assertThat(llm.systems.get(1)).startsWith(llm.systems.getFirst().strip())
                .contains("# 다시 쓰기", "리뷰를 받지 못한다", AnswerGuard.Rule.CODE_PATTERN.description,
                        AnswerGuard.Rule.REFERENCE_SIMILAR.description)
                .doesNotContain("while i <= n");
    }

    @Test
    void 다시_만들어도_섞이면_차단하고_보여_주지_않는다() throws Exception {
        long id = accepted(userId);
        llm.answer = FakeLlm.always(() -> FakeLlm.review("```\nprint(sum(i * i for i in range(n + 1)))\n```"));

        mvc.perform(post(review(id)).with(as(userId))).andExpect(status().is2xxSuccessful());
        awaitStatus(id, "COMPLETED");

        mvc.perform(get(review(id)).with(as(userId)))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.blocked").value(true))
                .andExpect(jsonPath("$.summary").isEmpty())
                .andExpect(jsonPath("$.complexity").isEmpty())
                .andExpect(jsonPath("$.improvements", hasSize(0)))
                .andExpect(jsonPath("$.nextConcepts", hasSize(0)))
                .andExpect(jsonPath("$.quota.used").value(1));
        // 차단된 결과도 재사용한다. 다시 눌러도 모델을 부르지 않는다.
        mvc.perform(post(review(id)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocked").value(true));
        assertThat(llm.calls).hasValue(2);
        assertThat(jdbc.sql("select content::text from ai_reviews where submission_id = :id").param("id", id)
                .query(String.class).single()).isEqualTo(AiReviewRunner.BLOCKED_CONTENT);
        // 보여 주지 않는 결과라 다음 개념도 저장하지 않는다.
        assertThat(concepts(id)).isEmpty();
    }

    @Test
    void 문제_태그의_이름을_다음_개념으로_써도_막지_않는다() throws Exception {
        insertedTagId = jdbc.sql("insert into concept_tags (slug, name) values ('test-greedy', '그리디')"
                + " on conflict do nothing returning id").query(Long.class).optional().orElse(null);
        long tagId = jdbc.sql("select id from concept_tags where name = '그리디'").query(Long.class).single();
        jdbc.sql("insert into problem_version_tags (problem_version_id, concept_tag_id) values (:versionId, :tagId)")
                .param("versionId", versionId).param("tagId", tagId).update();
        long id = accepted(userId);
        // 오답 분석이었다면 알고리즘 이름 규칙에 걸려 다시 만들었을 응답이다.
        llm.answer = FakeLlm.always(() -> FakeLlm.reviewWith("그리디하게 큰 수부터 고르는 방식도 생각해 보세요.", "그리디"));

        mvc.perform(post(review(id)).with(as(userId))).andExpect(status().is2xxSuccessful());
        awaitStatus(id, "COMPLETED");

        mvc.perform(get(review(id)).with(as(userId)))
                .andExpect(jsonPath("$.blocked").value(false))
                .andExpect(jsonPath("$.nextConcepts[0].name").value("그리디"));
        assertThat(llm.calls).hasValue(1);
        // 이름이 같은 개념 태그와 이어 저장한다.
        assertThat(concepts(id)).containsExactly("1 그리디 " + tagId);
    }

    @Test
    void 분석과_합쳐_하루_한도를_넘으면_429이고_있는_리뷰는_그대로_쓴다() throws Exception {
        long done = completedReview();
        row(submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER"), "ANALYSIS");
        row(submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER"), "ANALYSIS");
        long fresh = accepted(userId);
        int callsBefore = llm.calls.get();

        mvc.perform(post(review(fresh)).with(as(userId)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("AI_DAILY_LIMIT_EXCEEDED"))
                .andExpect(jsonPath("$.quota.used").value(3))
                .andExpect(jsonPath("$.quota.remaining").value(0));

        assertThat(llm.calls).hasValue(callsBefore);
        assertThat(jdbc.sql("select count(*) from ai_reviews where submission_id = :id").param("id", fresh)
                .query(Integer.class).single()).isZero();
        // 이미 있는 리뷰는 한도를 다 써도 보고 다시 요청할 수 있다. 정답이 아닌 제출은 한도와 상관없이 409다.
        mvc.perform(get(review(done)).with(as(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quota.remaining").value(0));
        mvc.perform(post(review(done)).with(as(userId))).andExpect(status().isOk());
        mvc.perform(post(review(submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER"))).with(as(userId)))
                .andExpect(status().isConflict());
    }

    @Test
    void 분석과_리뷰가_마지막_한_자리를_동시에_요청하면_하나만_만든다() throws Exception {
        row(submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER"), "ANALYSIS");
        row(submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER"), "CODE_REVIEW");
        long wrong = submission(userId, "SUBMIT", "COMPLETED", "WRONG_ANSWER");
        long right = accepted(userId);
        CountDownLatch release = new CountDownLatch(1);
        llm.answer = request -> {
            await(release);
            return FakeLlm.ok(request);
        };

        List<Object> results = race(List.of(
                () -> started(() -> analyses.request(userId, wrong).started()),
                () -> started(() -> codeReviews.request(userId, right).started())));

        assertThat(results).containsExactlyInAnyOrder(true, "AI_DAILY_LIMIT_EXCEEDED");
        assertThat(jdbc.sql("select count(*) from ai_reviews r join submissions s on s.id = r.submission_id"
                + " where s.user_id = :userId and r.status <> 'FAILED'").param("userId", userId)
                .query(Integer.class).single()).isEqualTo(3);
        release.countDown();
        awaitStatus(results.getFirst().equals(true) ? wrong : right, "COMPLETED");
    }

    @Test
    void 제출_코드에_없는_줄을_짚은_개선점은_지우고_검증_내역을_남긴다() throws Exception {
        // 제출 코드는 5줄이다.
        long id = accepted(userId);
        llm.answer = FakeLlm.always(() -> FakeLlm.review("12번 줄의 변수 이름을 더 분명하게 지으면 좋아요."));

        mvc.perform(post(review(id)).with(as(userId))).andExpect(status().isAccepted());
        awaitStatus(id, "COMPLETED");

        mvc.perform(get(review(id)).with(as(userId)))
                .andExpect(jsonPath("$.blocked").value(false))
                .andExpect(jsonPath("$.improvements", hasSize(0)))
                .andExpect(jsonPath("$.complexity.basis").value("3번 줄의 반복이 n번 돕니다."))
                .andExpect(jsonPath("$.factCheck").doesNotExist());
        assertThat(jdbc.sql("select (content -> 'factCheck')::text from ai_reviews where submission_id = :id")
                .param("id", id).query(String.class).single())
                .isEqualTo("{\"fixes\": [\"LINE_OUT_OF_RANGE@improvements[0]\"], \"demoted\": 0, \"removed\": 1, \"version\": 1,"
                        + " \"unresolved\": 0}");
    }

    private long completedReview() throws Exception {
        long id = accepted(userId);
        mvc.perform(post(review(id)).with(as(userId)));
        awaitStatus(id, "COMPLETED");
        return id;
    }

    // 시작했으면 true, 오류면 그 code
    private static Object started(Supplier<Boolean> request) {
        try {
            return request.get();
        } catch (ErrorResponseException e) {
            return e.getBody().getProperties().get("code");
        }
    }

    // 요청을 한꺼번에 출발시켜 결과를 넣은 순서대로 모은다.
    private static List<Object> race(List<Supplier<Object>> requests) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(requests.size());
        try {
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Object>> futures = requests.stream().map(request -> pool.submit(() -> {
                go.await();
                return request.get();
            })).toList();
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

    // 오늘 만든 끝난 결과 행. 하루 한도에 1회로 센다.
    private void row(long submissionId, String type) {
        jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, status, content, completed_at)"
                + " values (:id, :type, 'v1', 'fake-model', 'COMPLETED', '{\"summary\":\"결과\"}', now())")
                .param("id", submissionId).param("type", type).update();
    }

    // 제출의 코드 리뷰에 저장된 다음 개념. "순서 이름 태그id" 꼴이고, 맞는 태그가 없으면 태그id 자리가 -다.
    private List<String> concepts(long submissionId) {
        return jdbc.sql("select c.ordinal || ' ' || c.name || ' ' || coalesce(c.concept_tag_id::text, '-')"
                + " from ai_review_next_concepts c join ai_reviews r on r.id = c.ai_review_id"
                + " where r.submission_id = :id and r.review_type = 'CODE_REVIEW' order by c.ordinal")
                .param("id", submissionId).query(String.class).list();
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
        throw new AssertionError("AI 결과 상태가 " + expected + "가 되지 않았다: " + status);
    }

    private long user(String name) {
        return jdbc.sql("insert into users (email, nickname) values (:email, :nickname) returning id")
                .param("email", name + "@test.local").param("nickname", name).query(Long.class).single();
    }

    private long accepted(long owner) {
        return submission(owner, "SUBMIT", "COMPLETED", "ACCEPTED");
    }

    private long submission(long owner, String kind, String jobStatus, String verdict) {
        boolean judged = "COMPLETED".equals(jobStatus) || "JUDGE_ERROR".equals(jobStatus);
        return jdbc.sql("insert into submissions (user_id, problem_version_id, submission_kind, language, source_code,"
                + " job_status, verdict, judged_at)"
                + " values (:userId, :versionId, :kind, 'PYTHON', :source, :status, :verdict, :judgedAt) returning id")
                .param("userId", owner).param("versionId", versionId).param("kind", kind).param("source", SOURCE)
                .param("status", jobStatus).param("verdict", verdict)
                .param("judgedAt", judged ? OffsetDateTime.now(ZoneOffset.UTC) : null)
                .query(Long.class).single();
    }

    private static String review(long submissionId) {
        return "/api/submissions/" + submissionId + "/code-review";
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
