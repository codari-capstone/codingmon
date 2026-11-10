package com.codingmon.api.report;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.Page;
import com.codingmon.api.report.ReportRepository.Detail;
import com.codingmon.api.report.ReportRepository.ReportStatus;
import com.codingmon.api.report.ReportRepository.Summary;

// 관리자 신고 목록·상세·상태와 메모 저장(ADM-13). 처리 안 한 신고 수(ADM-10·12)도 목록의 totalElements로 준다.
@RestController
@RequestMapping("/api/admin/reports")
class AdminReportController {

    // adminMemo가 빠지면 null로 들어와 메모를 비운다(openapi AdminReportUpdate).
    record ReportUpdate(ReportStatus status, String adminMemo) {
    }

    private final ReportRepository reports;

    AdminReportController(ReportRepository reports) {
        this.reports = reports;
    }

    @GetMapping
    Page<Summary> list(@RequestParam(required = false) List<ReportStatus> status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + Page.MAX_SIZE) int size) {
        Page.check(page, size);
        // 빈 값(`?status=`)은 고르지 않은 것으로 본다(ProblemController.orEmpty와 같다).
        List<ReportStatus> statuses = status == null ? List.of() : status.stream().filter(s -> s != null).distinct().toList();
        return reports.list(statuses, page, size);
    }

    @GetMapping("/{id}")
    Detail detail(@PathVariable long id) {
        return reports.find(id).orElseThrow(AdminReportController::notFound);
    }

    @PutMapping("/{id}")
    ResponseEntity<Void> update(@PathVariable long id, @RequestBody ReportUpdate input) {
        String memo = input.adminMemo();
        if (input.status() == null || (memo != null && memo.indexOf('\0') >= 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (memo != null && memo.codePointCount(0, memo.length()) > ProblemReportController.MAX_LENGTH) {
            throw ApiErrors.error(HttpStatus.BAD_REQUEST, "INVALID_REPORT_MEMO", "메모가 1,000자를 넘어요. 1,000자 이하로 줄여 주세요");
        }
        if (memo != null) {
            memo = memo.strip();
            if (memo.isEmpty()) {
                memo = null;
            }
        }
        switch (reports.update(id, input.status(), memo)) {
            case UPDATED -> {
            }
            case NOT_FOUND -> throw notFound();
            case PROBLEM_DELETED -> throw ApiErrors.error(HttpStatus.BAD_REQUEST, "REPORT_PROBLEM_DELETED",
                    "삭제된 문제의 신고는 이 상태로 바꿀 수 없어요. 새로 고친 뒤 다시 확인해 주세요");
        }
        return ResponseEntity.noContent().build();
    }

    private static RuntimeException notFound() {
        return ApiErrors.error(HttpStatus.NOT_FOUND, "REPORT_NOT_FOUND", "신고를 찾을 수 없어요");
    }
}
