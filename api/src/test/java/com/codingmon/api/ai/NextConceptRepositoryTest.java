package com.codingmon.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;

import com.codingmon.api.ai.ConceptTagMatcher.Matched;
import com.codingmon.api.ai.NextConceptRepository.NextConcept;

// 실제 PostgreSQL에서 다음 개념 기록을 쓰고 사용자별로 읽는다(#83). 리뷰 행은 직접 넣는다.
// 리뷰를 만들 때 저장하는 흐름은 CodeReviewControllerTest가 본다. 테스트 DB에 다른 태그가 있을 수 있어 태그 이름에 suffix를 붙인다.
@SpringBootTest
class NextConceptRepositoryTest {

    @Autowired
    JdbcClient jdbc;

    @Autowired
    NextConceptRepository repository;

    @Autowired
    TransactionTemplate transactions;

    String suffix;
    long userId;
    long otherUserId;
    long problemId;
    long versionId;
    long tagId;

    @BeforeEach
    void setUp() {
        suffix = UUID.randomUUID().toString().substring(0, 8);
        userId = user("next-" + suffix);
        otherUserId = user("next-other-" + suffix);
        problemId = jdbc.sql("insert into problems (slug) values (:slug) returning id").param("slug", "next-" + suffix)
                .query(Long.class).single();
        versionId = jdbc.sql("insert into problem_versions (problem_id, version_no, title, difficulty, statement_markdown,"
                + " input_description, output_description, constraints_markdown)"
                + " values (:problemId, 1, :title, 'EASY', '1부터 N까지 더한다', 'N', '합', '1 ≤ N ≤ 100') returning id")
                .param("problemId", problemId).param("title", "합 구하기 " + suffix).query(Long.class).single();
        tagId = jdbc.sql("insert into concept_tags (slug, name) values (:slug, :name) returning id")
                .param("slug", "next-" + suffix).param("name", "등차수열-" + suffix).query(Long.class).single();
    }

    @AfterEach
    void tearDown() {
        // 사용자를 지우면 제출 → AI 결과 → 다음 개념이 함께 지워진다.
        jdbc.sql("delete from users where id in (:ids)").param("ids", List.of(userId, otherUserId)).update();
        jdbc.sql("delete from problem_versions where id = :id").param("id", versionId).update();
        jdbc.sql("delete from problems where id = :id").param("id", problemId).update();
        jdbc.sql("delete from concept_tags where id = :id").param("id", tagId).update();
    }

    @Test
    void 최근_리뷰의_개념을_리뷰_단위로_자른다() {
        long oldest = review(submission(userId), "CODE_REVIEW", "v1", "COMPLETED", 30);
        long middle = review(submission(userId), "CODE_REVIEW", "v1", "COMPLETED", 20);
        long newest = review(submission(userId), "CODE_REVIEW", "v1", "COMPLETED", 10);
        concepts(oldest, new Matched(1, "가장 오래된 개념", "이유", null));
        concepts(middle, new Matched(1, "등차수열-" + suffix, "식 하나로 합을 구해요.", tagId),
                new Matched(2, "수열의 합 공식", "반복 없이 구해요.", null));
        concepts(newest, new Matched(1, "나머지 연산", "자릿수를 다룰 때 좋아요.", null),
                new Matched(2, "누적 합", "구간 합을 빨리 구해요.", null),
                new Matched(3, "투 포인터", "두 위치를 같이 옮겨요.", null));

        List<NextConcept> recent = repository.findRecent(userId, 2);

        // 개념은 5개지만 리뷰 2개로 자른다. 늦게 끝난 리뷰부터, 리뷰 안에서는 응답 순서다.
        assertThat(recent).extracting(NextConcept::reviewId, NextConcept::ordinal, NextConcept::name).containsExactly(
                tuple(newest, 1, "나머지 연산"), tuple(newest, 2, "누적 합"), tuple(newest, 3, "투 포인터"),
                tuple(middle, 1, "등차수열-" + suffix), tuple(middle, 2, "수열의 합 공식"));
        NextConcept matched = recent.get(3);
        assertThat(matched.tag()).isEqualTo(new NextConceptRepository.Tag(tagId, "next-" + suffix, "등차수열-" + suffix));
        assertThat(matched.reason()).isEqualTo("식 하나로 합을 구해요.");
        assertThat(matched.problemId()).isEqualTo(problemId);
        assertThat(matched.problemTitle()).isEqualTo("합 구하기 " + suffix);
        assertThat(recent.get(4).tag()).isNull();
        assertThat(recent.get(0).reviewedAt()).isAfter(recent.get(3).reviewedAt());
        assertThat(repository.findRecent(userId, 100)).hasSize(6);
    }

    @Test
    void 끝난_코드_리뷰만_보고_제출마다_마지막_결과_하나만_쓴다() {
        long shown = review(submission(userId), "CODE_REVIEW", "v1", "COMPLETED", 40);
        concepts(shown, new Matched(1, "보이는 개념", "이유", null));
        // 남의 리뷰, 오답 분석, 실패한 시도의 행은 읽지 않는다(앞의 둘은 생길 수 없지만 조건으로도 막는다).
        concepts(review(submission(otherUserId), "CODE_REVIEW", "v1", "COMPLETED", 5), new Matched(1, "남의 개념", "이유", null));
        concepts(review(submission(userId), "ANALYSIS", "v1", "COMPLETED", 5), new Matched(1, "분석 개념", "이유", null));
        concepts(review(submission(userId), "CODE_REVIEW", "v1", "FAILED", 5), new Matched(1, "실패 개념", "이유", null));
        // 새 버전이 차단되면 개념 행이 없다. 이전 버전의 결과가 남는다.
        long blockedSubmission = submission(userId);
        long earlier = review(blockedSubmission, "CODE_REVIEW", "v1", "COMPLETED", 30);
        concepts(earlier, new Matched(1, "이전 버전 개념", "이유", null));
        review(blockedSubmission, "CODE_REVIEW", "v2", "COMPLETED", 3);
        // 두 버전 모두 끝났으면 늦게 끝난 것 하나만 쓴다.
        long twice = submission(userId);
        concepts(review(twice, "CODE_REVIEW", "v1", "COMPLETED", 20), new Matched(1, "v1 개념", "이유", null));
        long later = review(twice, "CODE_REVIEW", "v2", "COMPLETED", 10);
        concepts(later, new Matched(1, "v2 개념", "이유", null));

        assertThat(repository.findRecent(userId, 10)).extracting(NextConcept::reviewId, NextConcept::name).containsExactly(
                tuple(later, "v2 개념"), tuple(earlier, "이전 버전 개념"), tuple(shown, "보이는 개념"));
    }

    @Test
    void 다시_쓰면_한_벌만_남고_트랜잭션_밖에서는_쓰지_않는다() {
        long id = review(submission(userId), "CODE_REVIEW", "v1", "COMPLETED", 10);
        concepts(id, new Matched(1, "첫 개념", "이유", null), new Matched(2, "둘째 개념", "이유", null));
        concepts(id, new Matched(1, "새 개념", "이유", tagId));

        assertThat(repository.findRecent(userId, 1)).extracting(NextConcept::name).containsExactly("새 개념");
        assertThatThrownBy(() -> repository.replace(id, List.of(new Matched(1, "밖", "이유", null))))
                .isInstanceOf(IllegalTransactionStateException.class);
    }

    @Test
    void 태그를_지우면_원문은_남고_연결만_끊긴다() {
        long id = review(submission(userId), "CODE_REVIEW", "v1", "COMPLETED", 10);
        concepts(id, new Matched(1, "등차수열-" + suffix, "식 하나로 합을 구해요.", tagId));

        jdbc.sql("delete from concept_tags where id = :id").param("id", tagId).update();

        NextConcept concept = repository.findRecent(userId, 1).get(0);
        assertThat(concept.tag()).isNull();
        assertThat(concept.name()).isEqualTo("등차수열-" + suffix);
        assertThat(concept.reason()).isEqualTo("식 하나로 합을 구해요.");
    }

    @Test
    void 제출을_지우면_개념도_지워진다() {
        long submissionId = submission(userId);
        concepts(review(submissionId, "CODE_REVIEW", "v1", "COMPLETED", 10), new Matched(1, "개념", "이유", null));

        jdbc.sql("delete from submissions where id = :id").param("id", submissionId).update();

        assertThat(jdbc.sql("select count(*) from ai_review_next_concepts c join ai_reviews r on r.id = c.ai_review_id"
                + " where r.submission_id = :id").param("id", submissionId).query(Integer.class).single()).isZero();
    }

    @Test
    void 기록이_없으면_비어_있고_리뷰_개수는_1에서_100까지만_받는다() {
        assertThat(repository.findRecent(userId, 20)).isEmpty();
        // @Repository의 예외 변환이 IllegalArgumentException을 감싼다
        assertThatThrownBy(() -> repository.findRecent(userId, 0)).isInstanceOf(InvalidDataAccessApiUsageException.class)
                .hasCauseInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> repository.findRecent(userId, 101)).isInstanceOf(InvalidDataAccessApiUsageException.class)
                .hasCauseInstanceOf(IllegalArgumentException.class);
    }

    private long user(String name) {
        return jdbc.sql("insert into users (email, nickname) values (:email, :nickname) returning id")
                .param("email", name + "@test.local").param("nickname", name).query(Long.class).single();
    }

    private long submission(long owner) {
        return jdbc.sql("insert into submissions (user_id, problem_version_id, submission_kind, language, source_code,"
                + " job_status, verdict) values (:userId, :versionId, 'SUBMIT', 'PYTHON', 'print(1)', 'COMPLETED', 'ACCEPTED')"
                + " returning id")
                .param("userId", owner).param("versionId", versionId).query(Long.class).single();
    }

    // minutesAgo 전에 끝난 결과. 끝났으면 content가, 실패했으면 이유가 있어야 하므로 빈 객체와 INTERNAL을 넣는다.
    private long review(long submissionId, String type, String version, String status, int minutesAgo) {
        return jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model, status, content,"
                + " failure_reason, completed_at) values (:submissionId, :type, :version, 'test-model', :status,"
                + "   case when :status = 'COMPLETED' then '{}'::jsonb end, case when :status = 'FAILED' then 'INTERNAL' end,"
                + "   now() - make_interval(mins => :minutesAgo))"
                + " returning id")
                .param("submissionId", submissionId).param("type", type).param("version", version).param("status", status)
                .param("minutesAgo", minutesAgo).query(Long.class).single();
    }

    private void concepts(long reviewId, Matched... concepts) {
        transactions.executeWithoutResult(status -> repository.replace(reviewId, List.of(concepts)));
    }
}
