package com.codingmon.api.report;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.Page;

// 문제 신고(SOLVE-12)와 관리자 처리(ADM-13, #225).
@Repository
public class ReportRepository {

    enum ReportType {
        STATEMENT, IO_DESCRIPTION, SAMPLE, TEST_CASE, TYPO, OTHER
    }

    enum ReportStatus {
        RECEIVED, IN_PROGRESS, RESOLVED, REJECTED, PROBLEM_DELETED
    }

    record Summary(long id, Long problemId, String problemTitle, ReportType type, Long reporterId,
            String reporterNickname, Instant createdAt, ReportStatus status) {
    }

    record Detail(long id, Long problemId, String problemTitle, ReportType type, Long reporterId,
            String reporterNickname, Instant createdAt, ReportStatus status, String content, int versionNo,
            String adminMemo, Instant updatedAt) {
    }

    enum UpdateResult { UPDATED, NOT_FOUND, PROBLEM_DELETED }

    // 문제가 있으면 최신 버전 제목(관리자 문제 목록과 같다), 지워졌으면 신고 당시 제목. 닉네임도 지금 값을 읽는다.
    private static final String SELECT = "select r.id, r.problem_id, r.report_type, r.reporter_id, u.nickname,"
            + " r.created_at, r.status, r.content, r.problem_version_no, r.admin_memo, r.updated_at,"
            + " coalesce((select title from problem_versions where problem_id = r.problem_id order by version_no desc limit 1),"
            + " r.problem_title) as title"
            + " from problem_reports r left join users u on u.id = r.reporter_id";

    private final JdbcClient jdbc;

    ReportRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 공개 버전이 없으면(없는 문제·비공개) 넣지 않고 false. 공개 버전의 번호와 제목을 같은 문장에서 읽어 저장한다.
    // 문제 삭제(AdminProblemRepository.delete)가 문제 행을 잠근 사이에 들어오면 FK 검사가 기다렸다가 실패한다.
    // 그 경우는 호출한 쪽이 DataIntegrityViolationException을 404로 바꾼다.
    boolean create(long problemId, long reporterId, ReportType type, String content) {
        return jdbc.sql("insert into problem_reports (problem_id, problem_title, problem_version_no, reporter_id, report_type, content)"
                + " select problem_id, title, version_no, :reporterId, :type, :content"
                + " from problem_versions where problem_id = :problemId and status = 'PUBLISHED'")
                .param("problemId", problemId)
                .param("reporterId", reporterId)
                .param("type", type.name())
                .param("content", content)
                .update() == 1;
    }

    // count와 목록이 같은 시점을 보게 묶는다(AdminProblemRepository.list와 같다).
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    Page<Summary> list(List<ReportStatus> statuses, int page, int size) {
        Map<String, Object> params = new HashMap<>();
        String where = "";
        if (!statuses.isEmpty()) {
            where = " where r.status in (:statuses)";
            params.put("statuses", statuses.stream().map(Enum::name).toList());
        }
        long total = jdbc.sql("select count(*) from problem_reports r" + where).params(params).query(Long.class).single();
        params.put("limit", size);
        params.put("offset", (long) page * size);
        List<Summary> content = jdbc.sql(SELECT + where + " order by r.created_at desc, r.id desc limit :limit offset :offset")
                .params(params)
                .query(SUMMARY)
                .list();
        return new Page<>(content, total);
    }

    Optional<Detail> find(long id) {
        return jdbc.sql(SELECT + " where r.id = :id").param("id", id).query(DETAIL).optional();
    }

    // 상태 확인과 저장을 한 문장으로 해서, 같은 순간의 문제 삭제(markProblemDeleted)와 겹쳐도 저장하는 순간의 상태로 판단한다.
    // PROBLEM_DELETED를 보내면 지금도 PROBLEM_DELETED일 때 메모만 바꾼다. 그 밖의 상태는 PROBLEM_DELETED가 아니어야 하고,
    // 처리 안 한 상태(RECEIVED·IN_PROGRESS)로 바꿀 때는 문제가 있어야 한다(openapi updateAdminReport 1~3).
    UpdateResult update(long id, ReportStatus status, String adminMemo) {
        int updated;
        if (status == ReportStatus.PROBLEM_DELETED) {
            updated = jdbc.sql("update problem_reports set admin_memo = :memo, updated_at = now()"
                    + " where id = :id and status = 'PROBLEM_DELETED'")
                    .param("id", id)
                    .param("memo", adminMemo)
                    .update();
        } else {
            updated = jdbc.sql("update problem_reports set status = :status, admin_memo = :memo, updated_at = now()"
                    + " where id = :id and status <> 'PROBLEM_DELETED'"
                    + " and (problem_id is not null or :status in ('RESOLVED', 'REJECTED'))")
                    .param("id", id)
                    .param("status", status.name())
                    .param("memo", adminMemo)
                    .update();
        }
        if (updated == 1) {
            return UpdateResult.UPDATED;
        }
        boolean exists = jdbc.sql("select exists (select 1 from problem_reports where id = :id)")
                .param("id", id)
                .query(Boolean.class)
                .single();
        return exists ? UpdateResult.PROBLEM_DELETED : UpdateResult.NOT_FOUND;
    }

    // 문제를 지우는 트랜잭션(AdminProblemRepository.delete) 안에서, 문제 행을 지우기 전에 부른다.
    // 삭제가 FK에 막혀 되돌려지면 이 변경도 함께 되돌려진다. 이미 처리한 신고(RESOLVED·REJECTED)는 그대로 둔다.
    @Transactional(propagation = Propagation.MANDATORY)
    public void markProblemDeleted(long problemId) {
        jdbc.sql("update problem_reports set status = 'PROBLEM_DELETED', updated_at = now()"
                + " where problem_id = :id and status in ('RECEIVED', 'IN_PROGRESS')")
                .param("id", problemId)
                .update();
    }

    private static final RowMapper<Summary> SUMMARY = (rs, n) -> new Summary(rs.getLong("id"),
            rs.getObject("problem_id", Long.class), rs.getString("title"), ReportType.valueOf(rs.getString("report_type")),
            rs.getObject("reporter_id", Long.class), rs.getString("nickname"),
            instant(rs.getObject("created_at", OffsetDateTime.class)), ReportStatus.valueOf(rs.getString("status")));

    private static final RowMapper<Detail> DETAIL = (rs, n) -> new Detail(rs.getLong("id"),
            rs.getObject("problem_id", Long.class), rs.getString("title"), ReportType.valueOf(rs.getString("report_type")),
            rs.getObject("reporter_id", Long.class), rs.getString("nickname"),
            instant(rs.getObject("created_at", OffsetDateTime.class)), ReportStatus.valueOf(rs.getString("status")),
            rs.getString("content"), rs.getInt("problem_version_no"), rs.getString("admin_memo"),
            instant(rs.getObject("updated_at", OffsetDateTime.class)));

    private static Instant instant(OffsetDateTime time) {
        return time == null ? null : time.toInstant();
    }
}
