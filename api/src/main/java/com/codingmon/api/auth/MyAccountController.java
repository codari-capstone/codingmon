package com.codingmon.api.auth;

import java.time.Duration;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.codingmon.api.auth.MyAccountService.CurrentUser;

@RestController
@RequestMapping("/api/users/me")
class MyAccountController {

    private final MyAccountService accounts;

    MyAccountController(MyAccountService accounts) {
        this.accounts = accounts;
    }

    record NicknameRequest(String nickname) {
    }

    record PasswordRequest(String currentPassword, String newPassword, String newPasswordConfirm) {
    }

    // 화면 상단의 사용자 메뉴·관리자 메뉴(COM-01·05)와 마이페이지(MY-01)가 함께 쓴다.
    @GetMapping
    CurrentUser me(@AuthenticationPrincipal Jwt jwt) {
        return accounts.find(userId(jwt));
    }

    @PatchMapping
    CurrentUser updateNickname(@AuthenticationPrincipal Jwt jwt, @RequestBody NicknameRequest body) {
        return accounts.updateNickname(userId(jwt), body.nickname());
    }

    @PutMapping("/password")
    ResponseEntity<Void> changePassword(@AuthenticationPrincipal Jwt jwt, @RequestBody PasswordRequest body) {
        accounts.changePassword(userId(jwt), body.currentPassword(), body.newPassword(), body.newPasswordConfirm());
        return noContentClearingRefreshCookie();
    }

    @DeleteMapping
    ResponseEntity<Void> withdraw(@AuthenticationPrincipal Jwt jwt) {
        accounts.withdraw(userId(jwt));
        return noContentClearingRefreshCookie();
    }

    private static ResponseEntity<Void> noContentClearingRefreshCookie() {
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, AuthController.refreshCookie("", Duration.ZERO).toString())
                .build();
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
