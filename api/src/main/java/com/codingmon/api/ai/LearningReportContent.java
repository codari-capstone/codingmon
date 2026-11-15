package com.codingmon.api.ai;

import java.util.List;

// learning_reports.content(#85). 순서를 입력에 맞추고(LearningReportResult.alignedTo) 수치를 대조한(ReportNumberCheck) AI 문장이다.
// 수치와 목록은 담지 않는다. 화면의 수치·취약 개념·추천 문제는 learning_reports.statistics와 learning_report_recommendations가 준다.
// 통계와 맞지 않는 수치를 쓴 문장은 지웠고, 문장이 모두 지워진 글은 null이다. numberCheck는 대조 내역이라 API에는 주지 않는다.
record LearningReportContent(List<ConceptText> weakConcepts, List<Reason> recommendations, String summary,
        ReportNumberCheck.Meta numberCheck) {

    LearningReportContent {
        weakConcepts = List.copyOf(weakConcepts);
        recommendations = List.copyOf(recommendations);
    }

    // concept는 입력의 개념 이름 그대로다(통계의 name).
    record ConceptText(String concept, String explanation, String practice) {
    }

    // rank는 추천 순위다(learning_report_recommendations.rank).
    record Reason(int rank, String reason) {
    }
}
