package com.codingmon.api.report;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.report.ReportRepository.ReportType;

// 학습자의 문제 신고(SOLVE-12). 보낸 신고는 다시 볼 수 없어 돌려줄 내용이 없다. 횟수 제한은 없다(남용은 정지, ADM-16).
@RestController
class ProblemReportController {

    // DB의 VARCHAR(1000)과 같다. 받은 그대로 잰다(openapi ReportInput.maxLength와 같은 기준).
    static final int MAX_LENGTH = 1000;

    record ReportInput(ReportType type, String content) {
    }

    private final ReportRepository reports;

    ProblemReportController(ReportRepository reports) {
        this.reports = reports;
    }

    @PostMapping("/api/problems/{id}/reports")
    ResponseEntity<Void> create(@PathVariable long id, @RequestBody ReportInput input, @AuthenticationPrincipal Jwt jwt) {
        // 화면은 두 칸을 늘 채워 보낸다. 빠졌거나 null이면 잘못 만든 요청이라 code 없는 400이다.
        if (input.type() == null || input.content() == null || input.content().indexOf('\0') >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (input.content().length() > MAX_LENGTH) {
            throw ApiErrors.error(HttpStatus.BAD_REQUEST, "INVALID_REPORT_CONTENT", "신고 내용이 1,000자를 넘어요. 1,000자 이하로 줄여 주세요");
        }
        String content = input.content().strip();
        if (content.isEmpty()) {
            throw ApiErrors.error(HttpStatus.BAD_REQUEST, "INVALID_REPORT_CONTENT", "신고 내용을 입력해 주세요");
        }
        boolean created;
        try {
            created = reports.create(id, Long.parseLong(jwt.getSubject()), input.type(), content);
        } catch (DataIntegrityViolationException e) {
            // 신고와 같은 순간 문제가 지워졌다(ReportRepository.create)
            created = false;
        }
        if (!created) {
            throw ApiErrors.error(HttpStatus.NOT_FOUND, "PROBLEM_NOT_FOUND", "문제를 찾을 수 없어요");
        }
        return ResponseEntity.noContent().build();
    }
}
