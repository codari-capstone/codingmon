package com.codingmon.api.auth;

import java.time.Instant;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.user.Role;
import com.codingmon.api.user.User;
import com.codingmon.api.user.UserRepository;

// 마이페이지의 계정 정보·닉네임 변경·비밀번호 변경·회원 탈퇴(MY-01~04).
@Service
class MyAccountService {

    enum LoginMethod {
        EMAIL, GITHUB
    }

    record CurrentUser(Long id, String nickname, Role role, String avatarUrl, String email, LoginMethod loginMethod,
            String githubUsername) {
    }

    private final UserRepository users;
    private final OAuthAccountRepository oauthAccounts;
    private final RefreshTokenRepository refreshTokens;
    private final EmailCodeRepository emailCodes;
    private final AuthRateLimiter limiter;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate transactions;

    MyAccountService(UserRepository users, OAuthAccountRepository oauthAccounts, RefreshTokenRepository refreshTokens,
            EmailCodeRepository emailCodes, AuthRateLimiter limiter, PasswordEncoder passwordEncoder,
            TransactionTemplate transactions) {
        this.users = users;
        this.oauthAccounts = oauthAccounts;
        this.refreshTokens = refreshTokens;
        this.emailCodes = emailCodes;
        this.limiter = limiter;
        this.passwordEncoder = passwordEncoder;
        this.transactions = transactions;
    }

    // 닉네임은 바뀔 수 있어 토큰이 아니라 DB에서 읽는다. 토큰 검증(token_version 포함)은 SecurityConfig가 이미 했다.
    CurrentUser find(long userId) {
        User user = users.findById(userId).orElseThrow();
        String githubUsername = oauthAccounts.findByUserIdAndProvider(userId, OAuthAccount.GITHUB)
                .map(OAuthAccount::getProviderUsername)
                .orElse(null);
        return new CurrentUser(user.getId(), user.getNickname(), user.getRole(), user.getAvatarUrl(),
                maskEmail(user.getEmail()), user.getPasswordHash() == null ? LoginMethod.GITHUB : LoginMethod.EMAIL,
                githubUsername);
    }

    // 중복은 유일 인덱스가 최종 판정한다. 인덱스가 lower(nickname)이고 자기 행은 충돌하지 않아 alice -> Alice도 된다.
    CurrentUser updateNickname(long userId, String rawNickname) {
        String nickname = AccountRules.nickname(rawNickname);
        try {
            users.updateNickname(userId, nickname);
        } catch (DataIntegrityViolationException e) {
            if (AccountService.isNicknameConflict(e)) {
                throw AccountService.nicknameTaken();
            }
            throw e;
        }
        return find(userId);
    }

    // 검사 순서는 openapi.yaml의 changeMyPassword와 같다.
    // 해시는 트랜잭션 밖에서 계산해 그동안 DB 연결을 붙잡지 않는다. 변경과 폐기만 한 트랜잭션으로 묶는다.
    void changePassword(long userId, String currentPassword, String newPassword, String newPasswordConfirm) {
        User user = users.findById(userId).orElseThrow();
        String hash = user.getPasswordHash();
        if (hash == null) {
            throw AuthErrors.error(HttpStatus.FORBIDDEN, "PASSWORD_NOT_SET", "GitHub로 로그인한 계정은 비밀번호가 없어요");
        }
        Instant now = Instant.now();
        if (limiter.isPasswordLocked(userId, now)) {
            throw AuthErrors.error(HttpStatus.TOO_MANY_REQUESTS, "PASSWORD_LOCKED", "비밀번호를 너무 많이 틀렸어요. 5분 후 다시 시도해 주세요");
        }
        if (!passwordEncoder.matches(currentPassword == null ? "" : currentPassword, hash)) {
            limiter.recordPasswordFailure(userId, now);
            throw AuthErrors.error(HttpStatus.BAD_REQUEST, "WRONG_PASSWORD", "현재 비밀번호가 맞지 않아요");
        }
        limiter.resetPasswordFailures(userId);
        AccountRules.password(newPassword, newPasswordConfirm);
        if (passwordEncoder.matches(newPassword, hash)) {
            throw AuthErrors.error(HttpStatus.BAD_REQUEST, "SAME_PASSWORD", "현재 비밀번호와 달라야 해요");
        }
        String newHash = passwordEncoder.encode(newPassword);
        transactions.executeWithoutResult(status -> {
            // UPDATE가 사용자 행을 잠그므로 refresh token 폐기와 갱신·로그인 발급이 겹치지 않는다.
            if (users.changePassword(userId, user.getTokenVersion(), newHash) == 0) {
                // 그사이 비밀번호가 바뀌어 이 세션은 이미 로그아웃됐다.
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
            }
            refreshTokens.revokeAllOfUser(userId, now);
        });
    }

    // 딸린 데이터는 FK의 ON DELETE CASCADE로 지워진다. email_tokens만 사용자를 참조하지 않아 따로 지운다.
    void withdraw(long userId) {
        User user = users.findById(userId).orElseThrow();
        if (user.getRole() == Role.ADMIN) {
            throw AuthErrors.error(HttpStatus.FORBIDDEN, "ADMIN_CANNOT_WITHDRAW", "관리자는 탈퇴할 수 없어요");
        }
        transactions.executeWithoutResult(status -> {
            if (user.getEmail() != null) {
                emailCodes.deleteByEmail(user.getEmail());
            }
            users.deleteById(userId);
        });
    }

    // ab***@gmail.com. 앞부분이 3자 미만이면 첫 글자만 보여 준다.
    static String maskEmail(String email) {
        if (email == null) {
            return null;
        }
        int at = email.indexOf('@');
        return email.substring(0, at >= 3 ? 2 : 1) + "***" + email.substring(at);
    }
}
