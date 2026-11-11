package com.codingmon.api.auth;

import java.time.Instant;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.user.Role;
import com.codingmon.api.user.User;
import com.codingmon.api.user.UserRepository;

// 관리자의 계정 정지·해제·강제 탈퇴(ADM-16, #227). 정지는 비밀번호 재설정처럼 token_version을 올리고 refresh token을 폐기한다.
// 다시 로그인하는 것은 AuthTokenService.issue가 막는다.
@RestController
@RequestMapping("/api/admin/users/{id}")
class AdminAccountController {

    // DB의 VARCHAR(1000)과 같다. 신고 메모처럼 받은 그대로 문자 수로 잰다.
    static final int MAX_REASON_LENGTH = 1000;

    record SuspendInput(String reason) {
    }

    private final JdbcClient jdbc;
    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final MyAccountService accounts;
    private final TransactionTemplate transactions;

    AdminAccountController(JdbcClient jdbc, UserRepository users, RefreshTokenRepository refreshTokens,
            MyAccountService accounts, TransactionTemplate transactions) {
        this.jdbc = jdbc;
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.accounts = accounts;
        this.transactions = transactions;
    }

    // 이미 정지됐으면 아무것도 바꾸지 않는다. 정지 시각을 그대로 둬 24시간을 다시 세지 않는다.
    // UPDATE가 사용자 행을 잠가 같은 순간의 로그인(issue)과 차례로 실행된다.
    @PostMapping("/suspend")
    ResponseEntity<Void> suspend(@PathVariable long id, @RequestBody(required = false) SuspendInput input) {
        String reason = reason(input == null ? null : input.reason());
        transactions.executeWithoutResult(status -> {
            int updated = jdbc.sql("update users set suspended_at = now(), suspension_reason = :reason,"
                    + " token_version = token_version + 1 where id = :id and suspended_at is null and role = 'USER'")
                    .param("id", id)
                    .param("reason", reason)
                    .update();
            if (updated == 1) {
                refreshTokens.revokeAllOfUser(id, Instant.now());
                return;
            }
            User user = users.findById(id).orElseThrow(AdminAccountController::notFound);
            if (user.getRole() == Role.ADMIN) {
                throw adminForbidden();
            }
        });
        return ResponseEntity.noContent().build();
    }

    // 정지되지 않았으면 아무것도 바꾸지 않는다. 이미 로그아웃된 기기는 다시 로그인하면 된다.
    @PostMapping("/unsuspend")
    ResponseEntity<Void> unsuspend(@PathVariable long id) {
        int updated = jdbc.sql("update users set suspended_at = null, suspension_reason = null where id = :id")
                .param("id", id)
                .update();
        if (updated == 0) {
            throw notFound();
        }
        return ResponseEntity.noContent().build();
    }

    // 먼저 잠그지 않고 읽어 대부분의 거절을 바로 한다. 지울 때는 직접 탈퇴와 같이 제출 → 회원 순서로 잠그고(교착 방지),
    // 마지막 DELETE가 회원 행을 잠근 채 조건을 다시 본다. 그사이 다른 관리자가 정지를 풀었으면 0행이라 전체를 되돌린다.
    @DeleteMapping
    ResponseEntity<Void> forceWithdraw(@PathVariable long id) {
        User user = users.findById(id).orElseThrow(AdminAccountController::notFound);
        checkWithdrawable(user.getRole(), user.getSuspendedAt());
        Boolean withdrawn = transactions.execute(status -> {
            accounts.deleteOwnedData(user);
            int deleted = jdbc.sql("delete from users where id = :id and role = 'USER'"
                    + " and suspended_at <= now() - interval '24 hours'")
                    .param("id", id)
                    .update();
            if (deleted == 0) {
                status.setRollbackOnly();
            }
            return deleted == 1;
        });
        if (!Boolean.TRUE.equals(withdrawn)) {
            // 되돌렸다. 그사이 바뀐 상태로 이유를 다시 정한다. JPA 캐시를 거치지 않게 SQL로 읽는다.
            // 마지막 DELETE와 같은 조건이라 아래 검사를 통과할 수는 없지만, 통과하면 정지가 풀린 것으로 답한다.
            record State(Role role, Instant suspendedAt) {
            }
            State state = jdbc.sql("select role, suspended_at from users where id = :id")
                    .param("id", id)
                    .query((rs, n) -> new State(Role.valueOf(rs.getString("role")),
                            rs.getObject("suspended_at", java.time.OffsetDateTime.class) == null ? null
                                    : rs.getObject("suspended_at", java.time.OffsetDateTime.class).toInstant()))
                    .optional()
                    .orElseThrow(AdminAccountController::notFound);
            checkWithdrawable(state.role(), state.suspendedAt());
            throw notSuspended();
        }
        return ResponseEntity.noContent().build();
    }

    private static void checkWithdrawable(Role role, Instant suspendedAt) {
        if (role == Role.ADMIN) {
            // code는 정지와 같고(openapi forceWithdrawUser) 문구만 탈퇴에 맞춘다.
            throw ApiErrors.error(HttpStatus.FORBIDDEN, "ADMIN_CANNOT_BE_SUSPENDED", "관리자 계정은 탈퇴시킬 수 없어요");
        }
        if (suspendedAt == null) {
            throw notSuspended();
        }
        if (suspendedAt.isAfter(Instant.now().minusSeconds(24 * 60 * 60))) {
            throw ApiErrors.error(HttpStatus.CONFLICT, "SUSPENSION_TOO_RECENT", "정지하고 24시간이 지나야 강제 탈퇴할 수 있어요");
        }
    }

    private static String reason(String raw) {
        if (raw == null) {
            return null;
        }
        if (raw.indexOf('\0') >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (raw.codePointCount(0, raw.length()) > MAX_REASON_LENGTH) {
            throw ApiErrors.error(HttpStatus.BAD_REQUEST, "INVALID_SUSPENSION_REASON", "정지 사유가 1,000자를 넘어요. 1,000자 이하로 줄여 주세요");
        }
        String stripped = raw.strip();
        return stripped.isEmpty() ? null : stripped;
    }

    private static ErrorResponseException notSuspended() {
        return ApiErrors.error(HttpStatus.CONFLICT, "USER_NOT_SUSPENDED", "정지된 회원만 강제 탈퇴할 수 있어요");
    }

    private static ErrorResponseException notFound() {
        return ApiErrors.error(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "회원을 찾을 수 없어요");
    }

    private static ErrorResponseException adminForbidden() {
        return ApiErrors.error(HttpStatus.FORBIDDEN, "ADMIN_CANNOT_BE_SUSPENDED", "관리자 계정은 정지할 수 없어요");
    }
}
