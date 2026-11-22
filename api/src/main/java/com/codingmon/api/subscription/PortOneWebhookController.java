package com.codingmon.api.subscription;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Set;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import com.codingmon.api.ApiErrors;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

// 포트원 V2 웹훅(본문 버전 2024-04-25). 로그인 없이 Standard Webhooks 서명으로 확인한다(openapi receivePortoneWebhook).
// 본문의 상태는 믿지 않고 결제 ID로 포트원을 다시 조회해 반영한다.
@RestController
class PortOneWebhookController {

    private static final Logger log = LoggerFactory.getLogger(PortOneWebhookController.class);

    private static final Duration TOLERANCE = Duration.ofMinutes(5);
    private static final Set<String> HANDLED = Set.of("Transaction.Paid", "Transaction.Failed", "Transaction.Cancelled",
            "Transaction.PartialCancelled");

    private final SubscriptionRepository repo;
    private final PaymentResolver resolver;
    private final byte[] secret;
    private final JsonMapper json = JsonMapper.builder().build();

    PortOneWebhookController(SubscriptionRepository repo, PaymentResolver resolver,
            @Value("${app.portone.webhook-secret}") String webhookSecret) {
        this.repo = repo;
        this.resolver = resolver;
        this.secret = decodeSecret(webhookSecret);
    }

    @PostMapping("/api/portone/webhook")
    ResponseEntity<Void> receive(@RequestHeader(name = "webhook-id", required = false) String id,
            @RequestHeader(name = "webhook-timestamp", required = false) String timestamp,
            @RequestHeader(name = "webhook-signature", required = false) String signature, @RequestBody String body) {
        if (!verify(id, timestamp, signature, body)) {
            throw ApiErrors.error(HttpStatus.BAD_REQUEST, "WEBHOOK_SIGNATURE_INVALID", "웹훅 서명이 맞지 않아요");
        }
        Map<?, ?> payload;
        try {
            payload = json.readValue(body, Map.class);
        } catch (JacksonException e) {
            return ResponseEntity.ok().build();
        }
        if (!HANDLED.contains(String.valueOf(payload.get("type")))
                || !(payload.get("data") instanceof Map<?, ?> data) || !(data.get("paymentId") instanceof String paymentId)) {
            return ResponseEntity.ok().build();
        }
        // 기록부터 본다. 기록에 없는 결제(탈퇴로 지워진 결제, 다른 환경의 결제)는 포트원을 부르지 않고 200으로 무시한다.
        if (repo.findPayment(paymentId).isEmpty()) {
            return ResponseEntity.ok().build();
        }
        try {
            resolver.resolve(paymentId, null, false);
        } catch (PortOneClient.UnavailableException e) {
            // 200을 주면 포트원이 다시 보내지 않아 이 알림이 반영되지 않는다. 500이면 최대 5번 다시 보낸다.
            log.warn("웹훅 처리 중 포트원 조회 실패 {}", paymentId);
            throw new ErrorResponseException(HttpStatus.INTERNAL_SERVER_ERROR);
        }
        return ResponseEntity.ok().build();
    }

    // Standard Webhooks: base64(HMAC-SHA256(secret, "{id}.{timestamp}.{body}")). 헤더에는 "v1,<서명>"이 공백으로 여러 개 올 수 있다.
    boolean verify(String id, String timestamp, String signature, String body) {
        if (secret.length == 0 || id == null || timestamp == null || signature == null) {
            return false;
        }
        long seconds;
        try {
            seconds = Long.parseLong(timestamp);
        } catch (NumberFormatException e) {
            return false;
        }
        // 초 단위 숫자로만 비교한다. Instant로 바꾸면 범위 밖 값에서 예외가 난다.
        long now = Instant.now().getEpochSecond();
        if (seconds < now - TOLERANCE.toSeconds() || seconds > now + TOLERANCE.toSeconds()) {
            return false;
        }
        byte[] expected;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            expected = Base64.getEncoder().encode(mac.doFinal((id + "." + timestamp + "." + body).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException(e);
        }
        for (String part : signature.split(" ")) {
            int comma = part.indexOf(',');
            if (comma > 0 && "v1".equals(part.substring(0, comma))
                    && MessageDigest.isEqual(expected, part.substring(comma + 1).getBytes(StandardCharsets.UTF_8))) {
                return true;
            }
        }
        return false;
    }

    // 포트원 콘솔의 웹훅 Secret("whsec_" + base64). 비어 있으면 모든 웹훅을 거절한다.
    private static byte[] decodeSecret(String secret) {
        if (secret == null || secret.isBlank()) {
            return new byte[0];
        }
        String value = secret.startsWith("whsec_") ? secret.substring("whsec_".length()) : secret;
        try {
            return Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException e) {
            return value.getBytes(StandardCharsets.UTF_8);
        }
    }
}
