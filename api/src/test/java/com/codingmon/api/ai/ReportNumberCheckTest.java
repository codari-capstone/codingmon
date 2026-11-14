package com.codingmon.api.ai;

import static com.codingmon.api.ai.LearningReportSamples.stat;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.codingmon.api.learning.LearningStatsRepository.LearningStats;

// 학습 리포트 문장 속 수치 대조(#85). 입력은 더미 통계(LearningReportSamples)다.
// typical: 반복문 범위(6문제 중 3, 50%, 평균 3.17번, 힌트 1.67) · 인덱스 변환(4문제 중 2, 50%, 2.25번, 힌트 1)이 취약하고,
// 조건문(80%)·문자열(100%)은 아니다. 맞힌 문제 9개, 추천 3개(1·2위 반복문 범위, 3위 인덱스 변환), 다음 개념 누적합 2번·빠른 입출력 2번·리스트 슬라이싱 1번.
class ReportNumberCheckTest {

    private final LearningReportInput typical = LearningReportSamples.typical().input();

    @Test
    void 입력의_수치를_쓴_문장은_그대로_둔다() {
        LearningReportResult result = new LearningReportResult(List.of(
                weak("반복문 범위", "반복문 범위는 반복이 언제 끝나는지 정하는 개념이에요. 6문제 중 3문제를 맞혀 해결률은 50%이고, 평균 3.17번 시도했어요.",
                        "작은 입력으로 한 줄씩 따라가 보세요."),
                weak("인덱스 변환", "4문제 중 2문제를 맞혔어요.", "거꾸로 읽는 사물함 번호를 풀어 보세요.")),
                List.of(reason(1, "해결률 50%인 반복문 범위를 연습하기 좋아요."), reason(2, "전에 맞히지 못한 문제예요."),
                        reason(3, "평균 2.25번 시도한 인덱스 변환을 연습해요.")),
                "9문제를 맞혔어요. 조건문은 해결률 80%로 잘하고 있어요. 누적합을 리뷰에서 2번 권했어요.");

        ReportNumberCheck.Outcome outcome = ReportNumberCheck.verify(result, typical);

        assertThat(outcome.fixes()).isEmpty();
        assertThat(outcome.label()).isEqualTo("PASSED");
        assertThat(outcome.content().weakConcepts()).extracting(LearningReportContent.ConceptText::explanation)
                .containsExactly(result.weakConcepts().get(0).explanation(), "4문제 중 2문제를 맞혔어요.");
        assertThat(outcome.content().recommendations()).extracting(LearningReportContent.Reason::reason)
                .containsExactly("해결률 50%인 반복문 범위를 연습하기 좋아요.", "전에 맞히지 못한 문제예요.", "평균 2.25번 시도한 인덱스 변환을 연습해요.");
        assertThat(outcome.content().summary()).isEqualTo(result.summary());
        assertThat(outcome.content().numberCheck()).isEqualTo(new ReportNumberCheck.Meta(1, 0, 0, List.of()));
    }

    @Test
    void 다른_개념의_수치를_쓴_문장만_지우고_모두_지워지면_null이다() {
        LearningReportResult result = new LearningReportResult(List.of(
                weak("반복문 범위", "반복문 범위는 반복이 언제 끝나는지 정하는 개념이에요. 평균 2.25번 시도했어요.", "한 줄씩 따라가 보세요."),
                weak("인덱스 변환", "해결률이 80%라서 더 연습이 필요해요.", "번호를 거꾸로 세어 보세요.")),
                List.of(reason(1, "좋아요."), reason(2, "좋아요."), reason(3, "좋아요.")), "잘하고 있어요.");

        ReportNumberCheck.Outcome outcome = ReportNumberCheck.verify(result, typical);

        // 2.25번은 인덱스 변환의 평균 시도이고, 80%는 조건문의 해결률이다.
        assertThat(outcome.content().weakConcepts()).extracting(LearningReportContent.ConceptText::explanation)
                .containsExactly("반복문 범위는 반복이 언제 끝나는지 정하는 개념이에요.", null);
        assertThat(outcome.content().weakConcepts()).extracting(LearningReportContent.ConceptText::practice)
                .containsExactly("한 줄씩 따라가 보세요.", "번호를 거꾸로 세어 보세요.");
        assertThat(ReportNumberCheck.describe(outcome.fixes()))
                .isEqualTo("NUMBER@weakConcepts[0].explanation,PERCENT@weakConcepts[1].explanation");
        assertThat(outcome.label()).isEqualTo("FIXED");
        assertThat(outcome.content().numberCheck()).isEqualTo(new ReportNumberCheck.Meta(1, 2, 1,
                List.of("NUMBER@weakConcepts[0].explanation", "PERCENT@weakConcepts[1].explanation")));
    }

    @Test
    void 입력에_없는_수와_계산한_수는_지운다() {
        LearningReportResult result = withSummary(typical,
                "9문제를 맞혔어요. 두 개념의 해결률은 30% 차이가 나요. 평균 시도가 1.5배 많아요. 10문제를 더 풀어 보세요.");

        ReportNumberCheck.Outcome outcome = ReportNumberCheck.verify(result, typical);

        assertThat(outcome.content().summary()).isEqualTo("9문제를 맞혔어요.");
        assertThat(ReportNumberCheck.describe(outcome.fixes())).isEqualTo("PERCENT@summary,NUMBER@summary,NUMBER@summary");
        assertThat(outcome.content().numberCheck().removed()).isEqualTo(3);
    }

    @Test
    void 표기만_다른_같은_값은_맞는_것으로_본다() {
        LearningReportResult result = new LearningReportResult(List.of(
                weak("반복문 범위", "해결률은 50 퍼센트예요. 50프로를 넘겨 봐요.", "연습해요."),
                weak("인덱스 변환", "평균 2.250번 시도했고 힌트는 평균 1.0단계까지 열었어요.", "연습해요.")),
                List.of(reason(1, "좋아요."), reason(2, "좋아요."), reason(3, "좋아요.")), "잘하고 있어요.");

        assertThat(ReportNumberCheck.verify(result, typical).fixes()).isEmpty();
    }

    @Test
    void 순서_번호_힌트_단계_이름과_단위가_없는_수는_보지_않는다() {
        String practice = "힌트는 0~3단계 중 2단계까지만 열어 보세요. 2번째 추천 문제부터 다시 풀어 보세요. 1번 문제도 다시 읽어 보세요."
                + " 입력이 7이면 어떻게 될지 적어 보세요.";
        LearningReportResult result = new LearningReportResult(List.of(
                weak("반복문 범위", "개념이에요.", practice), weak("인덱스 변환", "개념이에요.", "연습해요.")),
                List.of(reason(1, "좋아요."), reason(2, "좋아요."), reason(3, "좋아요.")), "잘하고 있어요.");

        ReportNumberCheck.Outcome outcome = ReportNumberCheck.verify(result, typical);

        assertThat(outcome.fixes()).isEmpty();
        assertThat(outcome.content().weakConcepts().get(0).practice()).isEqualTo(practice);
    }

    @Test
    void 개념_이름과_문제_제목_속_숫자는_보지_않는다() {
        LearningReportInput input = LearningReportInput.of(
                new LearningStats(5, 5, 0, List.of(stat("grid", "2차원 배열", 5, 4, "0.80", "1.20", "0.40", "0.13", true))),
                List.of(LearningReportInput.Recommendation.of(1, "숫자 7개 고르기", "EASY", "2차원 배열", false)), List.of());
        LearningReportResult result = new LearningReportResult(
                List.of(weak("2차원 배열", "2차원 배열은 행과 열로 값을 담아요. 해결률 80%예요.", "숫자 7개 고르기를 풀어 보세요.")),
                List.of(reason(1, "숫자 7개 고르기로 연습해요. 7개 중 하나를 고르는 연습이에요.")), "잘하고 있어요.");

        ReportNumberCheck.Outcome outcome = ReportNumberCheck.verify(result, input);

        // 제목 밖의 "7개"는 입력에 없는 수다.
        assertThat(ReportNumberCheck.describe(outcome.fixes())).isEqualTo("NUMBER@recommendations[0].reason");
        assertThat(outcome.content().recommendations().get(0).reason()).isEqualTo("숫자 7개 고르기로 연습해요.");
        assertThat(outcome.content().weakConcepts().get(0).explanation())
                .isEqualTo("2차원 배열은 행과 열로 값을 담아요. 해결률 80%예요.");
    }

    @Test
    void 이름_속_문장_끝_표시에서_문장을_나누지_않는다() {
        LearningReportInput input = LearningReportInput.of(
                new LearningStats(5, 5, 0, List.of(stat("grid", "2차원 배열", 5, 4, "0.80", "1.20", "0.40", "0.13", true))),
                List.of(LearningReportInput.Recommendation.of(1, "몇 개일까? 7개 고르기", "EASY", "2차원 배열", false)), List.of());
        LearningReportResult result = new LearningReportResult(List.of(weak("2차원 배열", "행과 열로 값을 담아요.", "연습해요.")),
                List.of(reason(1, "몇 개일까? 7개 고르기로 연습해요. 3번 더 풀어 봐요.")), "잘하고 있어요.");

        ReportNumberCheck.Outcome outcome = ReportNumberCheck.verify(result, input);

        // 제목은 통째로 가려지고, 제목 밖의 "3번"만 입력에 없는 수다.
        assertThat(outcome.content().recommendations().get(0).reason()).isEqualTo("몇 개일까? 7개 고르기로 연습해요.");
        assertThat(ReportNumberCheck.describe(outcome.fixes())).isEqualTo("NUMBER@recommendations[0].reason");
    }

    @Test
    void 쉼표에_붙은_수와_천_단위_수도_대조한다() {
        LearningReportResult result = new LearningReportResult(List.of(
                weak("반복문 범위", "해결률은 50%예요. 다른 개념과 견주면 50%,80%예요.", "연습해요."),
                weak("인덱스 변환", "개념이에요.", "연습해요.")),
                List.of(reason(1, "좋아요."), reason(2, "좋아요."), reason(3, "좋아요.")),
                "반복문 범위는 6문제,인덱스 변환은 4문제를 풀었어요. 모두 1,000문제를 풀었어요.");

        ReportNumberCheck.Outcome outcome = ReportNumberCheck.verify(result, typical);

        // 80%는 조건문의 해결률이고 1,000은 입력에 없는 수다. 쉼표 뒤의 4문제는 인덱스 변환의 문제 수다.
        assertThat(outcome.content().weakConcepts().get(0).explanation()).isEqualTo("해결률은 50%예요.");
        assertThat(outcome.content().summary()).isEqualTo("반복문 범위는 6문제,인덱스 변환은 4문제를 풀었어요.");
        assertThat(ReportNumberCheck.describe(outcome.fixes()))
                .isEqualTo("PERCENT@weakConcepts[0].explanation,NUMBER@summary");
    }

    @Test
    void 추천_이유는_근거_개념의_수치만_쓰고_도전_문제는_전체_값만_쓴다() {
        // oneWeak: 나머지 연산(4문제 중 2, 50%)만 취약하고, 1위는 나머지 연산, 2위는 도전 문제다. 맞힌 문제 6개.
        LearningReportInput input = LearningReportSamples.oneWeak().input();
        LearningReportResult result = new LearningReportResult(List.of(weak("나머지 연산", "개념이에요.", "연습해요.")),
                List.of(reason(1, "나머지 연산 해결률 50%를 올려 봐요."), reason(2, "6문제를 맞힌 실력으로 도전해 봐요. 해결률 50%를 넘어 보세요.")),
                "잘하고 있어요.");

        ReportNumberCheck.Outcome outcome = ReportNumberCheck.verify(result, input);

        assertThat(outcome.content().recommendations()).extracting(LearningReportContent.Reason::reason)
                .containsExactly("나머지 연산 해결률 50%를 올려 봐요.", "6문제를 맞힌 실력으로 도전해 봐요.");
        assertThat(ReportNumberCheck.describe(outcome.fixes())).isEqualTo("PERCENT@recommendations[1].reason");
    }

    @Test
    void 다음_개념을_권한_횟수는_요약에서만_쓴다() {
        String sentence = "리스트 슬라이싱은 리뷰에서 1번 권했어요.";
        LearningReportResult result = new LearningReportResult(List.of(
                weak("반복문 범위", "개념이에요.", sentence), weak("인덱스 변환", "개념이에요.", "연습해요.")),
                List.of(reason(1, "좋아요."), reason(2, "좋아요."), reason(3, "좋아요.")), sentence);

        ReportNumberCheck.Outcome outcome = ReportNumberCheck.verify(result, typical);

        assertThat(outcome.content().weakConcepts().get(0).practice()).isNull();
        assertThat(outcome.content().summary()).isEqualTo(sentence);
    }

    @Test
    void 줄바꿈도_문장을_나누고_소수점은_나누지_않는다() {
        LearningReportResult result = withSummary(typical, "평균 3.17번 시도했어요\n해결률 30%예요");

        ReportNumberCheck.Outcome outcome = ReportNumberCheck.verify(result, typical);

        assertThat(outcome.content().summary()).isEqualTo("평균 3.17번 시도했어요");
    }

    private static LearningReportResult withSummary(LearningReportInput input, String summary) {
        return new LearningReportResult(
                input.weakConceptNames().stream().map(name -> weak(name, "개념이에요.", "연습해요.")).toList(),
                input.recommendationRanks().stream().map(rank -> reason(rank, "좋아요.")).toList(), summary);
    }

    private static LearningReportResult.WeakConcept weak(String concept, String explanation, String practice) {
        return new LearningReportResult.WeakConcept(concept, explanation, practice);
    }

    private static LearningReportResult.RecommendationReason reason(int rank, String reason) {
        return new LearningReportResult.RecommendationReason(rank, reason);
    }
}
