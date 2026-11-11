package com.codingmon.api.user;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.Page;

// 관리자 회원 목록·상세(ADM-14·15, #227).
@Repository
class AdminUserRepository {

    enum Status { ACTIVE, SUSPENDED }

    enum LoginMethod { EMAIL, GITHUB }

    record Summary(long id, String nickname, String email, Role role, Instant createdAt, Instant suspendedAt) {
    }

    record Counts(long all, long active, long suspended) {
    }

    record UserPage(List<Summary> content, long totalElements, Counts counts) {
    }

    record Row(Summary summary, LoginMethod loginMethod, String suspensionReason) {
    }

    private static final String COLUMNS = "select id, nickname, email, role, created_at, suspended_at, password_hash, suspension_reason";

    private final JdbcClient jdbc;

    AdminUserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 탭 개수는 검색어만 반영하고 탭(status)은 반영하지 않는다. 어느 탭을 봐도 세 개수가 같게 하려는 것이다.
    // 개수와 목록이 같은 시점을 보게 묶는다.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    UserPage list(Status status, String keyword, int page, int size) {
        Map<String, Object> params = new HashMap<>();
        String search = "";
        if (keyword != null) {
            // 닉네임·이메일 부분 일치(대소문자 무시). 숫자만이면 그 id도 찾는다.
            search = " and (nickname ilike :like escape '\\' or email ilike :like escape '\\'"
                    + (keyword.matches("\\d{1,18}") ? " or id = :id" : "") + ")";
            params.put("like", "%" + escapeLike(keyword) + "%");
            if (keyword.matches("\\d{1,18}")) {
                params.put("id", Long.parseLong(keyword));
            }
        }
        Counts counts = jdbc.sql("select count(*) as all_count, count(*) filter (where suspended_at is null) as active,"
                + " count(*) filter (where suspended_at is not null) as suspended from users where true" + search)
                .params(params)
                .query((rs, n) -> new Counts(rs.getLong("all_count"), rs.getLong("active"), rs.getLong("suspended")))
                .single();
        String filter = search + (status == null ? ""
                : status == Status.ACTIVE ? " and suspended_at is null" : " and suspended_at is not null");
        params.put("limit", size);
        params.put("offset", (long) page * size);
        List<Summary> content = jdbc.sql(COLUMNS + " from users where true" + filter + " order by id desc limit :limit offset :offset")
                .params(params)
                .query((rs, n) -> summary(rs))
                .list();
        long total = status == null ? counts.all() : status == Status.ACTIVE ? counts.active() : counts.suspended();
        return new UserPage(content, total, counts);
    }

    Optional<Row> find(long id) {
        return jdbc.sql(COLUMNS + " from users where id = :id")
                .param("id", id)
                .query((rs, n) -> new Row(summary(rs),
                        rs.getString("password_hash") == null ? LoginMethod.GITHUB : LoginMethod.EMAIL,
                        rs.getString("suspension_reason")))
                .optional();
    }

    private static Summary summary(ResultSet rs) throws SQLException {
        return new Summary(rs.getLong("id"), rs.getString("nickname"), rs.getString("email"), Role.valueOf(rs.getString("role")),
                instant(rs.getObject("created_at", OffsetDateTime.class)), instant(rs.getObject("suspended_at", OffsetDateTime.class)));
    }

    // ProblemRepository.escapeLike와 같다. `%`·`_`도 글자로 찾는다.
    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static Instant instant(OffsetDateTime time) {
        return time == null ? null : time.toInstant();
    }
}
