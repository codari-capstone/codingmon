package com.codingmon.api.ai;

import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.ErrorResponseException;

import com.codingmon.api.ApiErrors;

// AI 분석(F1·F2)과 리뷰(F3)를 합친 사용자당 하루 한도(AI_FEATURES 8절, database-schema.md).
// 새 시도를 잡을 때만 1회로 센다. 저장된 결과 재사용, 만드는 중인 결과 재요청, 힌트 열기는 시도를 잡지 않으므로 세지 않는다.
// 분석(AnalysisService)과 리뷰(CodeReviewService)가 시도를 잡을 때 claimWithin을 쓰고, 응답에 status를 담는다.
@Service
public class AiQuotaService {

    private final AiReviewRepository reviews;
    private final TransactionTemplate transactions;
    private final int limit;

    // 시도를 잡는 트랜잭션은 늘 새로 열고 READ COMMITTED로 둔다. 바깥 트랜잭션에 합류하면 그 커밋 전에 처리기에 넣게 되고,
    // 바깥이 REPEATABLE READ(읽기 저장소 여러 곳이 쓴다)면 잠금을 기다리기 전의 스냅샷으로 세어 앞 요청의 행을 못 본다.
    AiQuotaService(AiReviewRepository reviews, PlatformTransactionManager transactionManager,
            @Value("${app.llm.daily-limit}") int limit) {
        this.reviews = reviews;
        this.transactions = new TransactionTemplate(transactionManager);
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.limit = limit;
    }

    // 조회용. 잠그지 않는다. 관리자 회원 상세(AdminUserController)도 쓴다.
    public AiQuota status(long userId) {
        return AiQuota.of(limit, reviews.usedToday(userId));
    }

    // 본인 제출 행과 사용자 행을 이 순서로 잠근 한 트랜잭션에서 시도를 잡고, 잡기 전후로 센다. 이 시도로 횟수가 늘어 한도를 넘으면 429를 던져
    // 잡은 것(새 행, 또는 FAILED·버려진 PENDING을 되돌린 것)을 롤백한다. 잡지 못했으면(재사용·진행 중) 세지 않는다.
    // 오늘 시작한 버려진 PENDING은 이미 센 행이라 다시 잡아도 횟수가 늘지 않으므로, 한도를 낮춰 넘어 있어도 막지 않는다.
    // 제출 행을 먼저 잠그는 것은 탈퇴·채점 완료와 같은 순서라 교착을 막는다. 사용자 행 잠금에서 같은 사용자의 요청이 줄을 서므로,
    // 동시에 눌러도 뒤 요청이 앞 요청의 커밋된 행을 보고 센다.
    // 처리기에 넣는 일은 이 메서드가 돌아온(커밋한) 뒤에 부른 쪽이 한다. 커밋 전에 넣으면 처리기가 PENDING 행을 못 봐 결과를 버린다.
    <T> Optional<T> claimWithin(long userId, long submissionId, Supplier<Optional<T>> claim) {
        return transactions.execute(status -> {
            if (!reviews.lockSubmission(userId, submissionId)) {
                // 탈퇴와 겹쳐 제출이 지워졌다.
                throw ApiErrors.error(HttpStatus.NOT_FOUND, "SUBMISSION_NOT_FOUND", "제출을 찾을 수 없어요");
            }
            reviews.lockUser(userId);
            AiReviewRepository.Usage before = reviews.usedToday(userId);
            Optional<T> claimed = claim.get();
            if (claimed.isPresent()) {
                int after = reviews.usedToday(userId).used();
                if (after > before.used() && after > limit) {
                    throw exceeded(before);
                }
            }
            return claimed;
        });
    }

    // 롤백한 뒤의 횟수(시도를 잡기 전의 값)를 quota로 준다. remaining은 0이다.
    private ErrorResponseException exceeded(AiReviewRepository.Usage usage) {
        ErrorResponseException error = ApiErrors.error(HttpStatus.TOO_MANY_REQUESTS, "AI_DAILY_LIMIT_EXCEEDED",
                "오늘 쓸 수 있는 AI 분석·리뷰 %d회를 모두 썼어요. 한국 시각 오전 9시에 다시 쓸 수 있어요".formatted(limit));
        error.getBody().setProperty("quota", AiQuota.of(limit, usage));
        return error;
    }
}
