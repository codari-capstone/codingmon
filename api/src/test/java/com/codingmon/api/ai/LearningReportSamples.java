package com.codingmon.api.ai;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.codingmon.api.learning.LearningStatsRepository.ConceptStat;
import com.codingmon.api.learning.LearningStatsRepository.LearningStats;

// 학습 리포트 더미 통계 3세트(#84). 프롬프트 단위 테스트와 실제 모델 평가(LearningReportPromptIntegrationTest)가 같이 쓴다.
// 이 저장소는 공개다. 개념 이름은 플랫폼의 태그와 같지만 문제 제목은 플랫폼에 등록하는 문제(비공개 problems 저장소)와 겹치지 않게 지었다.
// 통계는 AI_FEATURES 7절 식으로 계산한 값이고, 취약 개념과 추천은 LearningStatsRepository·RecommendationRepository 규칙을 따른다.
final class LearningReportSamples {

    record Case(String name, LearningReportInput input) {

        // 테스트 이름에 입력 전체가 찍히지 않게 한다.
        @Override
        public String toString() {
            return name;
        }
    }

    private LearningReportSamples() {
    }

    static List<Case> all() {
        return List.of(typical(), oneWeak(), noWeak());
    }

    // 취약 개념 2개, 추천 3개(1위 태그 2개·2위 태그 1개, 그중 하나는 전에 틀린 문제). 다음 개념은 태그로 모이는 것과 이름으로 모이는 것이 섞였다.
    static Case typical() {
        LearningStats stats = new LearningStats(9, 5, 0, List.of(
                stat("loop-range", "반복문 범위", 6, 3, "0.50", "3.17", "1.67", "0.53", true),
                stat("index-shift", "인덱스 변환", 4, 2, "0.50", "2.25", "1.00", "0.41", true),
                stat("condition", "조건문", 5, 4, "0.80", "1.60", "0.40", "0.17", false),
                stat("string", "문자열", 3, 3, "1.00", "1.33", "0.00", "0.02", false)));
        List<LearningReportInput.Recommendation> recommendations = List.of(
                LearningReportInput.Recommendation.of(1, "버스 정류장 사이 거리", "EASY", "반복문 범위", false),
                LearningReportInput.Recommendation.of(2, "계단 오르기 기록", "MEDIUM", "반복문 범위", true),
                LearningReportInput.Recommendation.of(3, "거꾸로 읽는 사물함 번호", "EASY", "인덱스 변환", false));
        NextConceptRepository.Tag prefixSum = new NextConceptRepository.Tag(4, "prefix-sum", "누적합");
        List<NextConceptRepository.NextConcept> recent = List.of(
                next(30, "홀수 자리 숫자 더하기", 1, "누적합", "구간마다 합을 처음부터 다시 구하는 6~8번 줄을 앞에서 구한 합을 이어 쓰는 방식으로 바꿀 수 있어요.", prefixSum),
                next(30, "홀수 자리 숫자 더하기", 2, "빠른 입출력", "입력이 많을 때 한 줄씩 읽는 시간을 줄일 수 있어요.", null),
                next(27, "반 평균 키 구하기", 1, "누적 합", "여러 구간의 합을 물을 때 미리 합을 쌓아 두면 반복 없이 답할 수 있어요.", prefixSum),
                next(27, "반 평균 키 구하기", 2, "리스트 슬라이싱", "리스트의 일부를 잘라 쓰는 방법을 알면 3번 줄을 더 짧게 쓸 수 있어요.", null),
                next(21, "글자 바꾸기 놀이", 1, "빠른 입출력 ", "줄마다 출력하는 대신 모아서 한 번에 출력하면 빨라져요.", null));
        return new Case("전형 (취약 2개, 추천 3개, 다음 개념 겹침)", LearningReportInput.of(stats, recommendations, recent));
    }

    // 취약 개념 1개(2위는 0점이라 취약 개념이 아니다), 추천 2개 중 하나는 근거 개념이 없는 도전 문제. 다음 개념은 태그가 없는 것과
    // 취약하지 않은 개념의 태그다. 공개 문제를 거의 다 맞혀 추천이 3개보다 적다.
    static Case oneWeak() {
        LearningStats stats = new LearningStats(6, 5, 0, List.of(
                stat("modulo", "나머지 연산", 4, 2, "0.50", "2.00", "2.00", "0.50", true),
                stat("condition", "조건문", 3, 3, "1.00", "1.00", "0.00", "0.00", false),
                stat("loop-range", "반복문 범위", 2, 2, "1.00", "1.00", "0.00", "0.00", false)));
        List<LearningReportInput.Recommendation> recommendations = List.of(
                LearningReportInput.Recommendation.of(1, "요일 계산기", "MEDIUM", "나머지 연산", false),
                LearningReportInput.Recommendation.of(2, "미로 탈출 시간", "HARD", null, false));
        NextConceptRepository.Tag loopRange = new NextConceptRepository.Tag(1, "loop-range", "반복문 범위");
        List<NextConceptRepository.NextConcept> recent = List.of(
                next(15, "세 수 중 가운데 값", 1, "문자열 포매팅", "출력 문장을 만들 때 값을 끼워 넣는 방법을 쓰면 4번 줄이 읽기 쉬워져요.", null),
                next(12, "짝수만 더하기", 1, "반복 범위 정하기", "반복이 끝나는 값을 정확히 정하면 마지막 수를 빠뜨리지 않아요.", loopRange));
        return new Case("취약 1개 (도전 문제 섞임, 추천 2개)", LearningReportInput.of(stats, recommendations, recent));
    }

    // 모든 개념의 취약 점수가 0이라 취약 개념이 없다. 추천은 모두 도전 문제(MEDIUM → HARD → EASY)이고 코드 리뷰를 받은 적이 없다.
    static Case noWeak() {
        LearningStats stats = new LearningStats(5, 5, 0, List.of(
                stat("string", "문자열", 3, 3, "1.00", "1.00", "0.00", "0.00", false),
                stat("condition", "조건문", 2, 2, "1.00", "1.00", "0.00", "0.00", false)));
        List<LearningReportInput.Recommendation> recommendations = List.of(
                LearningReportInput.Recommendation.of(1, "단어 뒤집기 대회", "MEDIUM", null, false),
                LearningReportInput.Recommendation.of(2, "섬 개수 세기", "HARD", null, false),
                LearningReportInput.Recommendation.of(3, "숫자 카드 놀이", "EASY", null, false));
        return new Case("취약 0개 (도전 문제만, 다음 개념 없음)", LearningReportInput.of(stats, recommendations, List.of()));
    }

    static ConceptStat stat(String slug, String name, int problems, int solved, String solveRate, String attempts,
            String hintLevel, String weaknessScore, boolean weak) {
        return new ConceptStat(slug, name, problems, solved, new BigDecimal(solveRate), new BigDecimal(attempts),
                new BigDecimal(hintLevel), new BigDecimal(weaknessScore), weak);
    }

    // 최근 리뷰 순으로 넘긴다(NextConceptRepository.findRecent). reviewId는 submissionId와 같게 두고, 시각은 리포트 입력에 쓰이지 않는다.
    static NextConceptRepository.NextConcept next(long reviewId, String problemTitle, int ordinal, String name, String reason,
            NextConceptRepository.Tag tag) {
        return new NextConceptRepository.NextConcept(reviewId, reviewId, reviewId + 100, problemTitle,
                Instant.parse("2026-11-01T00:00:00Z").plusSeconds(reviewId), ordinal, name, reason, tag);
    }
}
