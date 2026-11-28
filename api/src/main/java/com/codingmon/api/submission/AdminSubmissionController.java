package com.codingmon.api.submission;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.Page;
import com.codingmon.api.submission.AdminSubmissionRepository.SolvedProblem;
import com.codingmon.api.submission.AdminSubmissionRepository.UserSubmission;
import com.codingmon.api.submission.SubmissionRepository.SubmissionResult;

// 관리자 회원 상세의 제출 목록·맞힌 문제·제출 펼치기(ADM-15, #227).
@RestController
@RequestMapping("/api/admin")
class AdminSubmissionController {

    private final AdminSubmissionRepository adminSubmissions;
    private final SubmissionRepository submissions;

    AdminSubmissionController(AdminSubmissionRepository adminSubmissions, SubmissionRepository submissions) {
        this.adminSubmissions = adminSubmissions;
        this.submissions = submissions;
    }

    @GetMapping("/users/{id}/submissions")
    Page<UserSubmission> userSubmissions(@PathVariable long id, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + Page.MAX_SIZE) int size) {
        Page.check(page, size);
        requireUser(id);
        return adminSubmissions.findSubmissions(id, page, size);
    }

    @GetMapping("/users/{id}/solved-problems")
    List<SolvedProblem> solvedProblems(@PathVariable long id) {
        requireUser(id);
        return adminSubmissions.findSolvedProblems(id);
    }

    // 학습자 결과 조회와 같은 모양이고 '본인 것만' 제한만 없다. 케이스별 결과는 주지 않는다.
    @GetMapping("/submissions/{id}")
    SubmissionResult submission(@PathVariable long id) {
        return submissions.findAnyResult(id)
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "SUBMISSION_NOT_FOUND", "제출을 찾을 수 없어요"));
    }

    private void requireUser(long id) {
        if (!adminSubmissions.userExists(id)) {
            throw userNotFound();
        }
    }

    private static ErrorResponseException userNotFound() {
        return ApiErrors.error(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "회원을 찾을 수 없어요");
    }
}
