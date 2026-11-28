package com.codingmon.api.ai;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import com.codingmon.api.ai.AiReviewRepository.FailureReason;
import com.codingmon.api.ai.AiReviewRepository.Status;
import com.codingmon.api.learning.LearningStatsRepository.ConceptStat;
import com.codingmon.api.learning.LearningStatsRepository.LearningStats;

// 화면에 주는 학습 리포트(contracts의 LearningReport, REP-02~05).
// 수치·취약 개념·추천 문제는 만들 때 저장한 서버 값(statistics, learning_report_recommendations)이고 AI 응답에서 가져오지 않는다.
// AI 문장은 COMPLETED일 때만 채우고, 수치 대조로 모두 지워진 글은 null이다(LearningReportContent).
record LearningReportView(LocalDate reportDate, Status status, FailureReason failureReason, Instant generatedAt,
        int solvedProblemCount, List<ConceptStat> concepts, String summary, List<WeakConcept> weakConcepts,
        List<Recommendation> recommendations) {

    record WeakConcept(String slug, String name, String explanation, String practice) {
    }

    record Recommendation(int rank, long problemId, String title, String difficulty, Concept concept, String solveStatus,
            String reason) {
    }

    // 추천의 근거가 된 취약 개념과 만들 때의 취약 점수(REP-04)
    record Concept(String slug, String name, BigDecimal weaknessScore) {
    }

    // content가 null이면 문장 없이 서버 값만 담는다(만드는 중이거나 실패했다).
    static LearningReportView of(LearningReportRepository.Stored stored, LearningStats statistics,
            LearningReportContent content, List<LearningReportRepository.ShownRecommendation> recommendations) {
        List<WeakConcept> weak = statistics.concepts().stream()
                .filter(ConceptStat::weak)
                .map(c -> {
                    Optional<LearningReportContent.ConceptText> text = content == null ? Optional.empty()
                            : content.weakConcepts().stream().filter(t -> t.concept().equals(c.name())).findFirst();
                    return new WeakConcept(c.slug(), c.name(), text.map(LearningReportContent.ConceptText::explanation)
                            .orElse(null), text.map(LearningReportContent.ConceptText::practice).orElse(null));
                })
                .toList();
        List<Recommendation> shown = recommendations.stream()
                .map(r -> new Recommendation(r.rank(), r.problemId(), r.title(), r.difficulty(),
                        concept(r, statistics), r.solveStatus(), reason(content, r.rank())))
                .toList();
        return new LearningReportView(stored.reportDate(), stored.status(), stored.failureReason(), stored.generatedAt(),
                statistics.solvedProblemCount(), statistics.concepts(), content == null ? null : content.summary(), weak,
                shown);
    }

    // 점수는 만들 때의 통계에서 slug로 찾는다. 근거 태그는 그 통계에서 점수가 0보다 큰 태그라 늘 있다. 개념 태그는 만든 뒤 이름이나
    // slug를 고치는 API가 없다.
    private static Concept concept(LearningReportRepository.ShownRecommendation r, LearningStats statistics) {
        if (r.conceptSlug() == null) {
            return null;
        }
        BigDecimal score = statistics.concepts().stream()
                .filter(c -> c.slug().equals(r.conceptSlug()))
                .map(ConceptStat::weaknessScore)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("추천 근거 개념이 통계에 없다: " + r.conceptSlug()));
        return new Concept(r.conceptSlug(), r.conceptName(), score);
    }

    // 수치 대조로 모두 지워진 이유는 null이다. Stream.findFirst는 null을 고르면 던지므로 순위로 먼저 찾고 꺼낸다.
    private static String reason(LearningReportContent content, int rank) {
        if (content == null) {
            return null;
        }
        return content.recommendations().stream().filter(r -> r.rank() == rank).findFirst()
                .map(LearningReportContent.Reason::reason).orElse(null);
    }
}
