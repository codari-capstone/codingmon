package com.codingmon.api.user;

import java.time.Instant;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.Page;
import com.codingmon.api.ai.AiQuota;
import com.codingmon.api.ai.AiQuotaService;
import com.codingmon.api.user.AdminUserRepository.LoginMethod;
import com.codingmon.api.user.AdminUserRepository.Status;
import com.codingmon.api.user.AdminUserRepository.UserPage;

// 관리자 회원 목록·상세(ADM-14·15, #227). 정지·해제·강제 탈퇴는 AdminAccountController, 제출은 AdminSubmissionController다.
@RestController
@RequestMapping("/api/admin/users")
class AdminUserController {

    record Detail(long id, String nickname, String email, Role role, Instant createdAt, Instant suspendedAt,
            LoginMethod loginMethod, String suspensionReason, AiQuota aiQuota) {
    }

    private final AdminUserRepository users;
    private final AiQuotaService aiQuota;

    AdminUserController(AdminUserRepository users, AiQuotaService aiQuota) {
        this.users = users;
        this.aiQuota = aiQuota;
    }

    @GetMapping
    UserPage list(@RequestParam(required = false) Status status, @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "" + Page.MAX_SIZE) int size) {
        Page.check(page, size);
        return users.list(status, keyword == null || keyword.isBlank() ? null : keyword.strip(), page, size);
    }

    @GetMapping("/{id}")
    Detail detail(@PathVariable long id) {
        AdminUserRepository.Row row = users.find(id)
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "회원을 찾을 수 없어요"));
        var s = row.summary();
        return new Detail(s.id(), s.nickname(), s.email(), s.role(), s.createdAt(), s.suspendedAt(), row.loginMethod(),
                row.suspensionReason(), aiQuota.status(id));
    }
}
