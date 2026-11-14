package com.codingmon.api.ai;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.codingmon.api.learning.LearningStatsRepository.ConceptStat;
import com.codingmon.api.learning.LearningStatsRepository.LearningStats;

// 학습 리포트(F4)에 보내는 근거(AI_FEATURES 7절). 서버가 계산한 개념별 통계, 서버가 고른 추천 문제, 최근 코드 리뷰의 다음 개념이다.
// 수치는 화면에 보이는 표기 그대로 문자열로 준다(해결률 0.49 → "49%", 평균 1.50 → "1.5", REP-02). 모델이 계산하거나 표기를
// 바꾸지 않게 하고, 문장 속 수치를 통계와 대조할 때(#85)도 이 표기를 기준으로 삼는다. 취약 점수는 넣지 않는다. 화면이 따로 보여 주고
// 입문자에게 뜻이 어려워 문장에 쓰지 않게 한다. 취약 개념은 weak로, 순서는 concepts의 순서(취약 점수가 높은 순)로 알 수 있다.
// 사용자·문제 번호와 slug는 넣지 않는다. 응답은 개념 이름과 추천 순위로 입력과 맞춘다(LearningReportResult).
// JSON 규칙은 AnalysisInput과 같다(빈 값은 넣지 않고 선언 순서대로).
record LearningReportInput(int solvedProblemCount, List<Concept> concepts, List<Recommendation> recommendations,
        List<NextConcept> nextConcepts) {

    // 다음 개념을 읽을 최근 코드 리뷰 수. 리포트를 만들 때(#85) NextConceptRepository.findRecent에 넘긴다.
    static final int NEXT_CONCEPT_REVIEWS = 10;
    // 모은 다음 개념 중 많이 나온 것부터 넣는 수
    static final int NEXT_CONCEPT_MAX_COUNT = 5;
    // 다음 개념마다 그 개념을 권한 리뷰의 문제 제목을 최근 순으로 넣는 수
    static final int NEXT_CONCEPT_PROBLEM_MAX_COUNT = 3;
    static final int TITLE_MAX_CHARS = 100;
    // 코드 리뷰 스키마의 상한(CodeReviewResult.CONCEPT_REASON_MAX_CHARS)과 같다. 이전 버전 리뷰가 더 길게 남아 있어도 이만큼만 넣는다.
    static final int NEXT_CONCEPT_REASON_MAX_CHARS = 300;

    // 개념 태그 하나의 통계. weak는 서버가 고른 취약 개념이다(상위 2개 중 0점이 아닌 태그, LearningStatsRepository).
    // averageAttempts는 문제마다 첫 정답까지 낸 횟수의 평균, averageHintLevel은 첫 정답까지 연 가장 높은 힌트 단계(0~3)의 평균이다.
    record Concept(String name, boolean weak, int problemCount, int solvedCount, String solveRate,
            String averageAttempts, String averageHintLevel) {

        static Concept of(ConceptStat stat) {
            return new Concept(stat.name(), stat.weak(), stat.problemCount(), stat.solvedCount(), percent(stat.solveRate()),
                    plain(stat.averageAttempts()), plain(stat.averageHintLevel()));
        }
    }

    // 서버가 고른 추천 문제(RecommendationRepository). concept는 추천의 근거가 된 취약 개념 이름이고, 없으면 취약 개념 후보가 모자라
    // 난이도로 고른 도전 문제다. attempted는 냈지만 아직 맞히지 못한 문제다(추천 후보는 아직 맞히지 않은 문제뿐이다).
    record Recommendation(int rank, String title, String difficulty, String concept, boolean attempted) {

        // difficulty는 problem_versions.difficulty(EASY·MEDIUM·HARD)다. 화면과 같은 한국어 이름으로 바꿔 보낸다.
        static Recommendation of(int rank, String title, String difficulty, String concept, boolean attempted) {
            return new Recommendation(rank, AnalysisInput.clip(title, TITLE_MAX_CHARS), difficultyName(difficulty), concept,
                    attempted);
        }
    }

    // 최근 코드 리뷰가 권한 다음 개념을 하나로 모은 것. count는 그 개념을 권한 리뷰 수, problems는 그 리뷰들의 문제 제목(최근 순),
    // reason은 가장 최근 리뷰가 쓴 이유다.
    record NextConcept(String name, int count, List<String> problems, String reason) {
    }

    // 맞힌 문제가 모자라 개념별 통계가 없으면 리포트를 만들지 않는다(REP-01).
    // recentConcepts는 NextConceptRepository.findRecent의 결과 그대로다(최근 리뷰 순, 리뷰 안에서는 응답 순).
    static LearningReportInput of(LearningStats stats, List<Recommendation> recommendations,
            List<NextConceptRepository.NextConcept> recentConcepts) {
        if (stats.remainingProblemCount() > 0) {
            throw new IllegalArgumentException("맞힌 문제가 모자라 리포트를 만들지 않는다: " + stats.solvedProblemCount());
        }
        return new LearningReportInput(stats.solvedProblemCount(), stats.concepts().stream().map(Concept::of).toList(),
                List.copyOf(recommendations), gather(recentConcepts));
    }

    String toJson() {
        return AnalysisInput.JSON.writeValueAsString(this);
    }

    // 응답의 weakConcepts가 이 순서와 이름을 따라야 한다.
    List<String> weakConceptNames() {
        return concepts.stream().filter(Concept::weak).map(Concept::name).toList();
    }

    // 응답의 recommendations가 이 순서와 순위를 따라야 한다.
    List<Integer> recommendationRanks() {
        return recommendations.stream().map(Recommendation::rank).toList();
    }

    // 같은 개념 태그와 맞춘 개념은 하나로 모은다. 맞는 태그가 없으면 띄어쓰기와 대소문자만 무시한 이름이 같을 때 모은다.
    // 이름은 태그 이름, 태그가 없으면 가장 최근에 쓴 원문이다. 많이 나온 순, 같으면 최근에 나온 순으로 NEXT_CONCEPT_MAX_COUNT개만 넣는다.
    static List<NextConcept> gather(List<NextConceptRepository.NextConcept> recent) {
        Map<String, List<NextConceptRepository.NextConcept>> groups = new LinkedHashMap<>();
        for (NextConceptRepository.NextConcept concept : recent) {
            String key = concept.tag() != null ? "tag:" + concept.tag().id()
                    : "name:" + concept.name().replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(concept);
        }
        List<NextConcept> gathered = new ArrayList<>();
        for (List<NextConceptRepository.NextConcept> group : groups.values()) {
            NextConceptRepository.NextConcept latest = group.get(0);
            String name = latest.tag() != null ? latest.tag().name() : latest.name().strip();
            List<String> problems = group.stream().map(c -> AnalysisInput.clip(c.problemTitle(), TITLE_MAX_CHARS))
                    .distinct().limit(NEXT_CONCEPT_PROBLEM_MAX_COUNT).toList();
            gathered.add(new NextConcept(name, group.size(), problems,
                    AnalysisInput.clip(latest.reason(), NEXT_CONCEPT_REASON_MAX_CHARS)));
        }
        // 정렬이 안정적이라 같은 횟수에서는 처음 나온 순서(최근 순)가 유지된다.
        gathered.sort(Comparator.comparingInt(NextConcept::count).reversed());
        return List.copyOf(gathered.subList(0, Math.min(NEXT_CONCEPT_MAX_COUNT, gathered.size())));
    }

    // 0.49 → "49%". 해결률은 소수 둘째 자리까지라 100을 곱하면 정수다. 화면(ReportPage)과 같이 반올림해 정수로 쓴다.
    static String percent(BigDecimal rate) {
        return rate.movePointRight(2).setScale(0, RoundingMode.HALF_UP).toPlainString() + "%";
    }

    // 1.50 → "1.5", 2.00 → "2". 화면은 JSON 숫자를 그대로 보여 주므로 끝의 0이 없다.
    static String plain(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private static String difficultyName(String difficulty) {
        return switch (difficulty) {
            case "EASY" -> "쉬움";
            case "MEDIUM" -> "보통";
            case "HARD" -> "어려움";
            default -> throw new IllegalArgumentException("모르는 난이도: " + difficulty);
        };
    }
}
