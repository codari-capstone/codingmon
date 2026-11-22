package com.codingmon.api.subscription;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import tools.jackson.databind.json.JsonMapper;

// 포트원 V2 REST API(https://developers.portone.io/api/rest-v2). 시연용 테스트 채널(토스페이먼츠)이라 실제로 돈이 나가지 않는다.
// API Secret이 비어 있으면 결제 API가 503을 주고 스케줄러는 포트원을 부르지 않는다.
// 모든 호출은 DB 잠금 밖에서 한다(openapi startSubscription).
@Component
public class PortOneClient {

    private static final Logger log = LoggerFactory.getLogger(PortOneClient.class);

    private static final ParameterizedTypeReference<Map<String, Object>> JSON = new ParameterizedTypeReference<>() {
    };

    // 포트원 오류 type. 이름은 포트원 REST V2 문서를 따르며, 키를 받은 뒤 실제 응답으로 한 번 확인한다.
    private static final Set<String> ALREADY_PAID = Set.of("ALREADY_PAID", "ALREADY_PAID_OR_WAITING");
    private static final Set<String> KEY_GONE = Set.of("BILLING_KEY_NOT_FOUND", "BILLING_KEY_ALREADY_DELETED");
    // 결제 실패로 닫는 오류. 카드사 거절과 쓸 수 없는 빌링키뿐이다.
    private static final Set<String> DECLINED = Set.of("PG_PROVIDER", "BILLING_KEY_NOT_FOUND", "BILLING_KEY_ALREADY_DELETED");

    enum KeyOwner { MATCH, INVALID }

    // 포트원 결제 조회 결과. 결제 대기·가상계좌 발급 같은 중간 상태는 IN_PROGRESS로 본다.
    enum PaymentStatus { PAID, FAILED, CANCELLED, IN_PROGRESS, NOT_FOUND }

    record PaymentInfo(PaymentStatus status, long amount, String currency, String billingKey, Instant paidAt) {
    }

    sealed interface PayResult permits Paid, Declined, AlreadyUsed, Unknown {
    }

    // 결제 완료. 이 응답은 서버가 정한 금액·빌링키로 보낸 요청의 답이라 대조하지 않는다.
    record Paid(Instant paidAt) implements PayResult {
    }

    // 카드사가 거절했거나 빌링키를 쓸 수 없다. reason은 포트원이 준 문구다.
    record Declined(String reason) implements PayResult {
    }

    // 같은 결제 ID가 이미 결제됐거나 진행 중이다. 실패가 아니므로 다시 조회해 따른다.
    record AlreadyUsed() implements PayResult {
    }

    // 응답을 받지 못했거나(시간 초과·5xx) 카드와 상관없는 오류(인증·요청 제한 등)다. 돈이 나갔는지 모르는 것으로 둔다.
    record Unknown() implements PayResult {
    }

    // 포트원이 응답하지 않거나 설정이 없다. 호출한 쪽이 결과를 모르는 것으로 처리한다.
    static class UnavailableException extends RuntimeException {
        UnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private final RestClient rest;
    private final String apiUrl;
    private final String storeId;
    private final boolean configured;
    private final JsonMapper json = JsonMapper.builder().build();

    PortOneClient(@Value("${app.portone.api-url}") String apiUrl, @Value("${app.portone.api-secret}") String apiSecret,
            @Value("${app.portone.store-id}") String storeId, @Value("${app.portone.connect-timeout}") Duration connectTimeout,
            @Value("${app.portone.read-timeout}") Duration readTimeout) {
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(connectTimeout);
        requests.setReadTimeout(readTimeout);
        this.rest = RestClient.builder().requestFactory(requests).baseUrl(apiUrl)
                .defaultHeader("Authorization", "PortOne " + apiSecret).build();
        this.apiUrl = apiUrl;
        this.storeId = storeId;
        this.configured = !apiSecret.isBlank();
    }

    boolean isConfigured() {
        return configured;
    }

    // 빌링키가 살아 있고 이 고객 ID로 발급됐는지 본다. 없거나 지워졌거나 다른 고객이면 INVALID.
    KeyOwner checkBillingKey(String billingKey, String customerId) {
        Map<String, Object> body = get("/billing-keys/" + encode(billingKey), true);
        if (body == null || !"ISSUED".equals(body.get("status"))) {
            return KeyOwner.INVALID;
        }
        return customerId.equals(nested(body, "customer", "id")) ? KeyOwner.MATCH : KeyOwner.INVALID;
    }

    // 빌링키로 바로 결제한다. 같은 paymentId로 두 번 결제되지 않는 것은 포트원이 보장한다.
    PayResult payWithBillingKey(String paymentId, String billingKey, String customerId, String orderName, int amount) {
        requireConfigured();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("storeId", storeId);
        request.put("billingKey", billingKey);
        request.put("orderName", orderName);
        request.put("customer", Map.of("id", customerId));
        request.put("amount", Map.of("total", amount));
        request.put("currency", "KRW");
        try {
            Map<String, Object> body = rest.post().uri("/payments/{id}/billing-key", paymentId)
                    .contentType(MediaType.APPLICATION_JSON).body(request).retrieve().body(JSON);
            Object paidAt = nested(body, "payment", "paidAt");
            return new Paid(paidAt instanceof String s ? Instant.parse(s) : Instant.now());
        } catch (RestClientResponseException e) {
            // type을 먼저 본다. 카드사 거절(PG_PROVIDER)은 502로 온다.
            Map<String, Object> error = errorBody(e);
            String type = String.valueOf(error.get("type"));
            // 같은 ID가 이미 결제됐거나 진행 중이다(openapi startSubscription 3단계).
            if (ALREADY_PAID.contains(type)) {
                return new AlreadyUsed();
            }
            if (DECLINED.contains(type)) {
                String message = error.get("message") instanceof String m ? m : "카드 결제에 실패했어요";
                return new Declined(message);
            }
            if (e.getStatusCode().is5xxServerError()) {
                log.warn("포트원 결제 응답 5xx {}: {} {}", paymentId, e.getStatusCode(), type);
                return new Unknown();
            }
            // 인증·요청 제한·요청 형식 오류 등 카드와 상관없는 오류. 실패로 닫지 않고 결과 모름으로 두면 같은 ID로 다시 보낸다.
            log.error("포트원 결제 요청 오류 {}: {} {}", paymentId, e.getStatusCode(), type);
            return new Unknown();
        } catch (RestClientException e) {
            log.warn("포트원 결제 응답 없음 {}: {}", paymentId, e.getClass().getSimpleName());
            return new Unknown();
        }
    }

    // 결제를 조회한다. 응답이 없으면 UnavailableException.
    PaymentInfo findPayment(String paymentId) {
        Map<String, Object> body = get("/payments/" + encode(paymentId), true);
        if (body == null) {
            return new PaymentInfo(PaymentStatus.NOT_FOUND, 0, null, null, null);
        }
        PaymentStatus status = switch (String.valueOf(body.get("status"))) {
            case "PAID" -> PaymentStatus.PAID;
            case "FAILED" -> PaymentStatus.FAILED;
            case "CANCELLED", "PARTIAL_CANCELLED" -> PaymentStatus.CANCELLED;
            default -> PaymentStatus.IN_PROGRESS;
        };
        Object total = nested(body, "amount", "total");
        Object paidAt = body.get("paidAt");
        return new PaymentInfo(status, total instanceof Number n ? n.longValue() : -1, (String) body.get("currency"),
                (String) body.get("billingKey"), paidAt instanceof String s ? Instant.parse(s) : null);
    }

    // 지웠거나 이미 없으면 true. 일시적인 오류(응답 없음·5xx)면 false라 다음 실행 때 다시 지운다.
    boolean deleteBillingKey(String billingKey) {
        requireConfigured();
        try {
            rest.delete().uri("/billing-keys/{key}?storeId={store}", billingKey, storeId).retrieve().toBodilessEntity();
            return true;
        } catch (RestClientResponseException e) {
            // 삭제 응답을 잃었거나 같은 키가 두 번 들어간 경우다. 다른 오류(인증·요청 제한 등)는 다음 실행 때 다시 지운다.
            String type = String.valueOf(errorBody(e).get("type"));
            if (KEY_GONE.contains(type)) {
                return true;
            }
            log.warn("포트원 빌링키 삭제 실패: {} {}", e.getStatusCode(), type);
            return false;
        } catch (RestClientException e) {
            // 예외 메시지에 빌링키가 든 URL이 있어 종류만 남긴다.
            log.warn("포트원 빌링키 삭제 응답 없음: {}", e.getClass().getSimpleName());
            return false;
        }
    }

    // 이 고객 ID로 발급된 빌링키를 모두 찾는다(since부터 지금까지, 모든 페이지). 중간에 실패하면 UnavailableException.
    // 필터 이름은 포트원 문서(빌링키 다건 조회)를 따른다. 키를 받은 뒤 실제 응답으로 한 번 확인한다.
    List<String> findBillingKeysOfCustomer(String customerId, Instant since) {
        List<String> keys = new ArrayList<>();
        for (int page = 0; ; page++) {
            Map<String, Object> filter = new LinkedHashMap<>();
            filter.put("storeId", storeId);
            filter.put("customerId", customerId);
            filter.put("timeRangeField", "REQUESTED_AT");
            filter.put("from", since.toString());
            filter.put("until", Instant.now().toString());
            String requestBody = json.writeValueAsString(Map.of("page", Map.of("number", page, "size", 100), "filter", filter));
            // 404나 예상과 다른 모양은 실패로 본다. 빈 목록으로 보면 탈퇴 정리 기록이 지워지고 빌링키가 포트원에 남는다.
            Map<String, Object> body = get("/billing-keys?requestBody=" + encode(requestBody), false);
            if (body == null || !(body.get("items") instanceof List<?> items) || !(nested(body, "page", "totalCount") instanceof Number n)) {
                throw new UnavailableException("포트원 빌링키 목록 응답이 예상과 다르다", null);
            }
            for (Object item : items) {
                if (item instanceof Map<?, ?> map && map.get("billingKey") instanceof String key) {
                    keys.add(key);
                }
            }
            if (items.isEmpty() || (long) (page + 1) * 100 >= n.longValue()) {
                return keys;
            }
        }
    }

    // 404면 null. 그 밖의 오류와 응답 없음은 UnavailableException.
    private Map<String, Object> get(String pathAndQuery, boolean appendStoreId) {
        requireConfigured();
        String uri = appendStoreId ? pathAndQuery + (pathAndQuery.contains("?") ? "&" : "?") + "storeId=" + encode(storeId)
                : pathAndQuery;
        try {
            // 쿼리를 이미 인코딩했으므로 URI를 그대로 넘겨 다시 인코딩되지 않게 한다.
            return rest.get().uri(URI.create(apiUrl + uri)).retrieve().body(JSON);
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 404) {
                return null;
            }
            throw new UnavailableException("포트원 응답 오류 " + e.getStatusCode(), e);
        } catch (RestClientException e) {
            // 원인 예외는 넘기지 않는다. 메시지에 빌링키가 든 URL이 있다.
            throw new UnavailableException("포트원 응답 없음 " + e.getClass().getSimpleName(), null);
        }
    }

    private void requireConfigured() {
        if (!configured) {
            throw new UnavailableException("포트원 설정(PORTONE_API_SECRET)이 없다", null);
        }
    }

    private Map<String, Object> errorBody(RestClientResponseException e) {
        try {
            Map<String, Object> body = e.getResponseBodyAs(JSON);
            return body == null ? Map.of() : body;
        } catch (RuntimeException ignored) {
            return Map.of();
        }
    }

    private static Object nested(Map<String, Object> body, String outer, String inner) {
        return body != null && body.get(outer) instanceof Map<?, ?> map ? map.get(inner) : null;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
