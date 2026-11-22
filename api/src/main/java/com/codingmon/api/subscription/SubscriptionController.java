package com.codingmon.api.subscription;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.subscription.SubscriptionRepository.Cycle;
import com.codingmon.api.subscription.Subscriptions.View;

// 내 구독(MY-06)과 프로 구독 시작(PAY-01·02, #332).
@RestController
@RequestMapping("/api/users/me/subscription")
class SubscriptionController {

    // agreed는 형식 검사가 아니라 1단계 뒤에 확인한다. 그래야 동의 없이 보낸 빌링키를 지운다.
    record StartRequest(String billingKey, Cycle cycle, Boolean agreed) {
    }

    record CycleRequest(Cycle cycle, Boolean agreed) {
    }

    private final SubscriptionService subscriptions;

    SubscriptionController(SubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @GetMapping
    View find(@AuthenticationPrincipal Jwt jwt) {
        return subscriptions.find(userId(jwt));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    View start(@AuthenticationPrincipal Jwt jwt, @RequestBody StartRequest body) {
        if (body.billingKey() == null || body.billingKey().isBlank() || body.cycle() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return subscriptions.start(userId(jwt), body.billingKey(), body.cycle(), body.agreed());
    }

    @PostMapping("/cancel")
    View cancel(@AuthenticationPrincipal Jwt jwt) {
        return subscriptions.cancel(userId(jwt));
    }

    @PostMapping("/resume")
    View resume(@AuthenticationPrincipal Jwt jwt) {
        return subscriptions.resume(userId(jwt));
    }

    @PutMapping("/cycle")
    View changeCycle(@AuthenticationPrincipal Jwt jwt, @RequestBody CycleRequest body) {
        if (body.cycle() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return subscriptions.changeCycle(userId(jwt), body.cycle(), body.agreed());
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
