package com.codingmon.api.ai;

import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;

// AI 처리기. 채점 슬롯과 다른 스레드에서 돌아 모델이 느려도 채점을 막지 않는다.
// 팀 서버의 모델 하나를 나눠 쓰므로 스레드 수가 곧 동시 호출 한도이고, 나머지 요청은 대기열에서 차례를 기다린다.
// 대기열이 차면 더 쌓지 않고 바로 BUSY로 돌려준다(모델 서버의 429인 RATE_LIMITED와 구분한다, #81).
@Component
class AiWorker {

    private static final Logger log = LoggerFactory.getLogger(AiWorker.class);

    private final LlmClient llm;
    private final AiReviewRepository reviews;
    private final ExecutorService workers;
    // 서버가 내려갈 때 끝내 줄 요청. 대기열에서 버려지는 작업의 future는 스스로 끝나지 않는다.
    private final Set<CompletableFuture<?>> pending = ConcurrentHashMap.newKeySet();

    @Autowired
    AiWorker(LlmClient llm, AiReviewRepository reviews, @Value("${app.llm.workers}") int threads,
            @Value("${app.llm.queue-capacity}") int queueCapacity) {
        this(llm, reviews, new ThreadPoolExecutor(threads, threads, 0L, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(queueCapacity), Thread.ofPlatform().name("ai-", 1).daemon(true).factory()));
    }

    AiWorker(LlmClient llm, AiReviewRepository reviews, ExecutorService workers) {
        this.llm = llm;
        this.reviews = reviews;
        this.workers = workers;
    }

    // 오답 분석·코드 리뷰. 쓴 토큰을 ai_reviews 행에 더한다.
    <T> CompletableFuture<LlmResponse<T>> submit(long reviewId, LlmRequest<T> request) {
        return submit("AI 리뷰 " + reviewId, usage -> reviews.addUsage(reviewId, usage), request);
    }

    // target은 로그에 남길 이름, usage는 쓴 토큰을 더할 곳이다. 학습 리포트는 learning_reports 행에 더한다.
    // 표마다 번호가 따로 매겨지므로 번호만 받으면 다른 표의 같은 번호 행에 더하게 된다.
    <T> CompletableFuture<LlmResponse<T>> submit(String target, Consumer<LlmUsage> usage, LlmRequest<T> request) {
        CompletableFuture<LlmResponse<T>> result;
        try {
            result = CompletableFuture.supplyAsync(() -> run(target, usage, request), workers);
        } catch (RejectedExecutionException e) {
            LlmException.Kind kind = workers.isShutdown() ? LlmException.Kind.UNAVAILABLE : LlmException.Kind.BUSY;
            return CompletableFuture.failedFuture(new LlmException(kind, "AI 요청을 받을 수 없다", e, LlmUsage.NONE));
        }
        pending.add(result);
        result.whenComplete((response, failure) -> pending.remove(result));
        // 큐에 넣고 등록하기 전에 stop()이 지나갔으면 버려진 작업을 끝내 줄 곳이 없다.
        if (workers.isShutdown()) {
            result.completeExceptionally(stopping());
        }
        return result;
    }

    private <T> LlmResponse<T> run(String target, Consumer<LlmUsage> usage, LlmRequest<T> request) {
        try {
            LlmResponse<T> response = llm.complete(request);
            recordUsage(target, usage, response.usage());
            return response;
        } catch (LlmException e) {
            recordUsage(target, usage, e.usage());
            throw e;
        }
    }

    // 기록이 실패해도 이미 받은 응답이나 원래 오류를 가리지 않는다.
    private static void recordUsage(String target, Consumer<LlmUsage> sink, LlmUsage usage) {
        if (usage.equals(LlmUsage.NONE)) {
            return;
        }
        try {
            sink.accept(usage);
        } catch (RuntimeException e) {
            log.warn("{}의 토큰 수를 기록하지 못했다", target, e);
        }
    }

    @PreDestroy
    void stop() {
        workers.shutdownNow();
        LlmException stopped = stopping();
        pending.forEach(task -> task.completeExceptionally(stopped));
    }

    private static LlmException stopping() {
        return new LlmException(LlmException.Kind.UNAVAILABLE, "서버가 내려가는 중이다", null, LlmUsage.NONE);
    }
}
