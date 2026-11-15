package com.codingmon.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.ErrorResponseException;

import com.codingmon.api.user.User;
import com.codingmon.api.user.UserRepository;

@SpringBootTest(properties = "app.judge0.url=")
class PasswordResetIdentityTest {
    @Autowired PasswordResetService resets;
    @Autowired AuthCertificates certificates;
    @Autowired EmailCodeRepository codes;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;
    @Autowired TransactionTemplate transactions;
    @Autowired JdbcClient jdbc;
    @Value("${app.jwt.secret}") String secret;
    final List<Long> ids = new ArrayList<>();
    String email;
    User original;

    @BeforeEach
    void setUp() {
        email = UUID.randomUUID() + "@test.local";
        original = user("Original1!");
    }

    @AfterEach
    void cleanUp() {
        transactions.executeWithoutResult(s -> codes.deleteByEmail(email));
        jdbc.sql("delete from users where id in (:ids)").param("ids", ids).update();
    }

    @Test
    void 삭제_후_같은_이메일로_가입해도_이전_증명서는_새_계정을_바꾸지_못한다() throws Exception {
        String proof = proof();
        users.deleteById(original.getId());
        User replacement = user("Replacement1!");

        assertExpired(proof);
        User unchanged = users.findById(replacement.getId()).orElseThrow();
        assertThat(passwords.matches("Replacement1!", unchanged.getPasswordHash())).isTrue();
        assertThat(unchanged.getTokenVersion()).isZero();
    }

    @Test
    void 정상_증명서는_한_번_재설정하고_기존_refresh를_폐기한다() throws Exception {
        String proof = proof();
        jdbc.sql("insert into refresh_tokens (user_id, token_hash, family_id, expires_at)"
                + " values (:id, :hash, :family, now() + interval '1 day')")
                .param("id", original.getId()).param("hash", UUID.randomUUID().toString())
                .param("family", UUID.randomUUID()).update();

        resets.reset(proof, "Changed123!", "Changed123!");
        User changed = users.findById(original.getId()).orElseThrow();
        assertThat(passwords.matches("Changed123!", changed.getPasswordHash())).isTrue();
        assertThat(changed.getTokenVersion()).isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from refresh_tokens where user_id = :id and revoked_at is null")
                .param("id", original.getId()).query(Integer.class).single()).isZero();
        assertExpired(proof);
    }

    @Test
    void 계정_ID가_없는_기존_증명서는_이메일로_대체하지_않는다() {
        String legacy = certificates.issue(AuthCertificates.Purpose.PASSWORD_RESET, PasswordResetService.RESET_TTL,
                Map.of("email", email, "tokenVersion", 0));
        assertExpired(legacy);
    }

    @Test
    void 비밀번호_입력_오류는_증명서를_소비하지_않는다() throws Exception {
        String proof = proof();
        assertThatThrownBy(() -> resets.reset(proof, "short", "short"))
                .isInstanceOfSatisfying(ErrorResponseException.class,
                        e -> assertThat(e.getBody().getProperties().get("code")).isEqualTo("INVALID_PASSWORD"));
        resets.reset(proof, "Changed123!", "Changed123!");
    }

    private String proof() throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(JwtConfig.decodeSecret(secret), "HmacSHA256"));
        String hash = HexFormat.of().formatHex(mac.doFinal("123456".getBytes(StandardCharsets.UTF_8)));
        codes.saveAndFlush(new EmailCode(email, EmailCode.Purpose.RESET_PASSWORD, hash, Instant.now().plusSeconds(300)));
        return resets.verifyCode(email, "123456");
    }

    private User user(String password) {
        User user = users.saveAndFlush(new User(email, passwords.encode(password), UUID.randomUUID().toString()));
        ids.add(user.getId());
        return user;
    }

    private void assertExpired(String proof) {
        assertThatThrownBy(() -> resets.reset(proof, "Changed123!", "Changed123!"))
                .isInstanceOfSatisfying(ErrorResponseException.class,
                        e -> assertThat(e.getBody().getProperties().get("code")).isEqualTo("RESET_EXPIRED"));
    }
}
