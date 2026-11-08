package com.codingmon.api.ai;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 코드 리뷰가 권한 다음 개념(ai_review_next_concepts, #83). 리뷰가 COMPLETED로 저장되는 트랜잭션 안에서 CodeReviewService가
// 개념 태그와 맞춰(ConceptTagMatcher) 쓰고, 학습 리포트(F4, #45)가 findRecent로 사용자별 최근 기록을 읽는다.
// 원문은 ai_reviews.content에도 그대로 있다. 맞춘 태그는 저장할 때 정하고, 나중에 태그가 늘어도 다시 맞추지 않는다.
@Repository
public class NextConceptRepository {

    static final int MAX_REVIEWS = 100;

    private final JdbcClient jdbc;

    NextConceptRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 리뷰 하나가 권한 개념 하나. name·reason은 모델이 쓴 원문이고, tag는 맞춘 개념 태그다(맞는 태그가 없으면 null).
    // ordinal은 그 리뷰 안의 순서(1부터), reviewedAt은 리뷰가 끝난 시각이다.
    public record NextConcept(long reviewId, long submissionId, long problemId, String problemTitle, Instant reviewedAt,
            int ordinal, String name, String reason, Tag tag) {
    }

    // id는 학습 추천(RecommendationRepository.Recommendation.conceptTagId), slug는 개념별 통계(LearningStats.ConceptStat)와 맞출 때 쓴다.
    public record Tag(long id, String slug, String name) {
    }

    // 사용자의 최근 코드 리뷰 maxReviews개(1~100)가 권한 개념. 리뷰가 끝난 순서의 역순, 리뷰 안에서는 응답 순서다.
    // 개념 행이 아니라 리뷰 개수로 자르므로 한 리뷰의 개념이 중간에 잘리지 않는다. 기간 제한은 없다.
    // 본인 채점 제출(SUBMIT)의 끝난 코드 리뷰만 본다. 차단된 결과는 개념 행이 없어 빠진다.
    // 한 제출에 프롬프트 버전마다 리뷰가 있으면 개념 행이 있는 것 중 가장 늦게 끝난 하나만 쓴다(새 버전이 차단돼도 이전 결과가 남는다).
    // 같은 문제의 다른 제출이나 여러 리뷰에 나온 같은 개념은 그대로 둔다. 모으는 것은 리포트가 한다.
    // maxReviews가 범위를 벗어나면 InvalidDataAccessApiUsageException이다(@Repository가 IllegalArgumentException을 감싼다).
    public List<NextConcept> findRecent(long userId, int maxReviews) {
        if (maxReviews < 1 || maxReviews > MAX_REVIEWS) {
            throw new IllegalArgumentException("maxReviews는 1~" + MAX_REVIEWS + "여야 한다: " + maxReviews);
        }
        return jdbc.sql("""
                with latest as (
                    select distinct on (r.submission_id) r.id, r.submission_id, r.completed_at, s.problem_version_id
                    from ai_reviews r
                    join submissions s on s.id = r.submission_id
                    where s.user_id = :userId and s.submission_kind = 'SUBMIT'
                      and r.review_type = 'CODE_REVIEW' and r.status = 'COMPLETED'
                      and exists (select 1 from ai_review_next_concepts c where c.ai_review_id = r.id)
                    order by r.submission_id, r.completed_at desc, r.id desc
                ), recent as (
                    select * from latest order by completed_at desc, id desc limit :maxReviews
                )
                select x.id as review_id, x.submission_id, v.problem_id, v.title, x.completed_at,
                       c.ordinal, c.name, c.reason, t.id as tag_id, t.slug as tag_slug, t.name as tag_name
                from recent x
                join problem_versions v on v.id = x.problem_version_id
                join ai_review_next_concepts c on c.ai_review_id = x.id
                left join concept_tags t on t.id = c.concept_tag_id
                order by x.completed_at desc, x.id desc, c.ordinal
                """)
                .param("userId", userId)
                .param("maxReviews", maxReviews)
                .query((rs, n) -> {
                    Long tagId = rs.getObject("tag_id", Long.class);
                    Tag tag = tagId == null ? null : new Tag(tagId, rs.getString("tag_slug"), rs.getString("tag_name"));
                    return new NextConcept(rs.getLong("review_id"), rs.getLong("submission_id"), rs.getLong("problem_id"),
                            rs.getString("title"), rs.getObject("completed_at", OffsetDateTime.class).toInstant(),
                            rs.getInt("ordinal"), rs.getString("name"), rs.getString("reason"), tag);
                })
                .list();
    }

    // 맞출 대상인 모든 개념 태그. 표가 작아(수십 개) 리뷰마다 다 읽는다.
    List<ConceptTagMatcher.Tag> findAllTags() {
        return jdbc.sql("select id, slug, name from concept_tags order by id")
                .query((rs, n) -> new ConceptTagMatcher.Tag(rs.getLong("id"), rs.getString("slug"), rs.getString("name")))
                .list();
    }

    // 리뷰의 개념을 새로 쓴다. 리뷰를 COMPLETED로 바꾼 트랜잭션 안에서만 부른다(AiReviewRunner). 둘 중 하나만 남지 않게 한다.
    @Transactional(propagation = Propagation.MANDATORY)
    void replace(long reviewId, List<ConceptTagMatcher.Matched> concepts) {
        jdbc.sql("delete from ai_review_next_concepts where ai_review_id = :id").param("id", reviewId).update();
        for (ConceptTagMatcher.Matched concept : concepts) {
            jdbc.sql("insert into ai_review_next_concepts (ai_review_id, ordinal, name, reason, concept_tag_id)"
                    + " values (:id, :ordinal, :name, :reason, :tagId)")
                    .param("id", reviewId)
                    .param("ordinal", concept.ordinal())
                    .param("name", concept.name())
                    .param("reason", concept.reason())
                    .param("tagId", concept.tagId())
                    .update();
        }
    }
}
