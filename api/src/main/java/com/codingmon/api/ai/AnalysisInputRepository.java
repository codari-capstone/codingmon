package com.codingmon.api.ai;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.Language;
import com.codingmon.api.judge.RuntimeErrorType;
import com.codingmon.api.judge.Verdict;

// 제출 하나로 AI 분석 입력(AnalysisInput)을 만든다. 채점이 끝난 SUBMIT 제출만 받는다.
// 본인 제출인지, 분석할 판정인지는 부르는 쪽이 본다(#77).
// 비공개 케이스는 판정·에러 종류·입력 바이트 수만 읽는다. input_data·expected_output·stdout·stderr를 고르지 않아
// 원문이 이 클래스 밖으로 나갈 길이 없다(AI_FEATURES 8절). 비공개 실행의 출력에도 입력이 복사될 수 있다(ARCHITECTURE 5.2).
@Repository
class AnalysisInputRepository {

    private record Head(long versionId, AnalysisInput.Problem problem, AnalysisInput.Submission submission) {
    }

    private final JdbcClient jdbc;

    AnalysisInputRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 컴파일 에러는 케이스를 실행하지 않았으므로 예제 결과와 비공개 요약 없이 컴파일 메시지만 넣는다.
    @Transactional(readOnly = true)
    Optional<AnalysisInput> find(long submissionId) {
        return findHead(submissionId).map(head -> head.submission().verdict() == Verdict.COMPILE_ERROR
                ? new AnalysisInput(head.problem(), head.submission(), null, null)
                : new AnalysisInput(head.problem(), head.submission(),
                        AnalysisInput.Samples.of(findSamples(submissionId, head.versionId())),
                        AnalysisInput.HiddenTests.of(findHiddenCases(submissionId, head.versionId()))));
    }

    // 코드 리뷰(F3) 입력. 정답 제출이라 예제와 비공개 테스트는 모두 통과했으므로 문제와 제출만 읽는다(예제·비공개 쿼리를 돌리지 않는다).
    @Transactional(readOnly = true)
    Optional<CodeReviewInput> findReview(long submissionId) {
        return findHead(submissionId).map(head -> new CodeReviewInput(head.problem(), head.submission()));
    }

    private Optional<Head> findHead(long submissionId) {
        return jdbc.sql("select s.problem_version_id, s.language, s.verdict, s.runtime_error_type, s.execution_time_ms,"
                + " s.memory_used_kb, s.source_code, s.compiler_message, v.title, v.statement_markdown,"
                + " v.input_description, v.output_description, v.constraints_markdown, c.time_limit_ms, c.memory_limit_mb,"
                + " array(select t.name from problem_version_tags pvt join concept_tags t on t.id = pvt.concept_tag_id"
                + "   where pvt.problem_version_id = v.id order by t.id) as tags"
                + " from submissions s join problem_versions v on v.id = s.problem_version_id"
                + " join problem_language_configs c on c.problem_version_id = s.problem_version_id and c.language = s.language"
                + " where s.id = :id and s.submission_kind = 'SUBMIT' and s.job_status = 'COMPLETED'")
                .param("id", submissionId)
                .query((rs, n) -> new Head(rs.getLong("problem_version_id"),
                        AnalysisInput.Problem.of(rs.getString("title"), rs.getString("statement_markdown"),
                                rs.getString("input_description"), rs.getString("output_description"),
                                rs.getString("constraints_markdown"), rs.getInt("time_limit_ms"),
                                rs.getInt("memory_limit_mb"), List.of((String[]) rs.getArray("tags").getArray())),
                        AnalysisInput.Submission.of(Language.valueOf(rs.getString("language")),
                                Verdict.valueOf(rs.getString("verdict")),
                                enumOrNull(RuntimeErrorType.class, rs.getString("runtime_error_type")),
                                rs.getObject("execution_time_ms", Integer.class),
                                rs.getObject("memory_used_kb", Integer.class), rs.getString("source_code"),
                                rs.getString("compiler_message"))))
                .optional();
    }

    // 번호는 문제 상세의 예제 순서다. 실행하지 않은 예제는 뺀다.
    private List<AnalysisInput.Sample> findSamples(long submissionId, long versionId) {
        return jdbc.sql("select * from (select row_number() over (order by c.ordinal) as no, c.input_data,"
                + " c.expected_output, r.verdict, r.runtime_error_type, r.stdout, r.stderr, r.execution_time_ms,"
                + " r.memory_used_kb"
                + " from test_cases c left join submission_test_results r"
                + "   on r.test_case_id = c.id and r.submission_id = :submissionId"
                + " where c.problem_version_id = :versionId and c.case_type = 'SAMPLE') samples"
                + " where verdict is not null order by no")
                .param("submissionId", submissionId)
                .param("versionId", versionId)
                .query((rs, n) -> AnalysisInput.Sample.of(rs.getInt("no"), Verdict.valueOf(rs.getString("verdict")),
                        enumOrNull(RuntimeErrorType.class, rs.getString("runtime_error_type")),
                        rs.getString("input_data"), rs.getString("expected_output"), rs.getString("stdout"),
                        rs.getString("stderr"), rs.getObject("execution_time_ms", Integer.class),
                        rs.getObject("memory_used_kb", Integer.class)))
                .list();
    }

    // 원문 컬럼을 고르지 않는다. 입력은 바이트 수만 읽는다.
    private List<AnalysisInput.HiddenCase> findHiddenCases(long submissionId, long versionId) {
        return jdbc.sql("select r.verdict, r.runtime_error_type, octet_length(c.input_data) as input_bytes"
                + " from test_cases c join submission_test_results r"
                + "   on r.test_case_id = c.id and r.submission_id = :submissionId"
                + " where c.problem_version_id = :versionId and c.case_type = 'HIDDEN' and r.verdict is not null"
                + " order by c.ordinal")
                .param("submissionId", submissionId)
                .param("versionId", versionId)
                .query((rs, n) -> new AnalysisInput.HiddenCase(Verdict.valueOf(rs.getString("verdict")),
                        enumOrNull(RuntimeErrorType.class, rs.getString("runtime_error_type")), rs.getInt("input_bytes")))
                .list();
    }

    private static <E extends Enum<E>> E enumOrNull(Class<E> type, String name) {
        return name == null ? null : Enum.valueOf(type, name);
    }
}
