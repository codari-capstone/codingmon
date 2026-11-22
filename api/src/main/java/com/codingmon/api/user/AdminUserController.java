package com.codingmon.api.user;

import java.time.Instant;
import java.util.List;

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
import com.codingmon.api.subscription.Subscriptions;
import com.codingmon.api.user.AdminUserRepository.LoginMethod;
import com.codingmon.api.user.AdminUserRepository.Status;
import com.codingmon.api.user.AdminUserRepository.UserPage;

// 관리자 회원 목록·상세(ADM-14·15, #227). 정지·해제·강제 탈퇴는 AdminAccountController, 제출은 AdminSubmissionController다.
@RestController
@RequestMapping("/api/admin/users")
class AdminUserController {

    // AdminUserSummary. subscription은 목록의 요금제·마감일 칸(ADM-14)에 쓴다.
    record Item(long id, String nickname, String email, Role role, Instant createdAt, Instant suspendedAt,
            Subscriptions.View subscription) {
    }

    record ItemPage(List<Item> content, long totalElements, AdminUserRepository.Counts counts) {
    }

    record Detail(long id, String nickname, String email, Role role, Instant createdAt, Instant suspendedAt,
            Subscriptions.View subscription, LoginMethod loginMethod, String suspensionReason, AiQuota aiQuota,
            Instant subscriptionStartedAt, Integer refundAmount, List<Subscriptions.AdminPayment> payments) {
    }

    private final AdminUserRepository users;
    private final AiQuotaService aiQuota;
    private final Subscriptions subscriptions;

    AdminUserController(AdminUserRepository users, AiQuotaService aiQuota, Subscriptions subscriptions) {
        this.users = users;
        this.aiQuota = aiQuota;
        this.subscriptions = subscriptions;
    }

    @GetMapping
    ItemPage list(@RequestParam(required = false) Status status, @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "false") boolean paymentNeedsCancel,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "" + Page.MAX_SIZE) int size) {
        Page.check(page, size);
        UserPage result = users.list(status, keyword == null || keyword.isBlank() ? null : keyword.strip(),
                paymentNeedsCancel, page, size);
        List<Item> content = result.content().stream()
                .map(s -> new Item(s.id(), s.nickname(), s.email(), s.role(), s.createdAt(), s.suspendedAt(),
                        subscriptions.adminView(s.id())))
                .toList();
        return new ItemPage(content, result.totalElements(), result.counts());
    }

    @GetMapping("/{id}")
    Detail detail(@PathVariable long id) {
        AdminUserRepository.Row row = users.find(id)
                .orElseThrow(() -> ApiErrors.error(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "회원을 찾을 수 없어요"));
        var s = row.summary();
        Subscriptions.AdminDetail billing = subscriptions.adminDetail(id);
        return new Detail(s.id(), s.nickname(), s.email(), s.role(), s.createdAt(), s.suspendedAt(),
                subscriptions.adminView(id), row.loginMethod(), row.suspensionReason(), aiQuota.status(id),
                billing.subscriptionStartedAt(), billing.refundAmount(), billing.payments());
    }
}
