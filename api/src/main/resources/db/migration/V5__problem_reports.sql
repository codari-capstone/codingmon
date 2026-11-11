-- 학습자의 문제 신고(SOLVE-12)와 관리자 처리(ADM-13, #225).
-- 문제가 지워지거나 신고자가 탈퇴해도 신고는 남긴다. 연결만 끊고(SET NULL) 내용은 그대로 둔다.
CREATE TABLE problem_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    problem_id BIGINT REFERENCES problems(id) ON DELETE SET NULL,
    -- 신고 당시 제목. 목록은 문제가 있으면 최신 버전 제목을 보여 주고, 지워진 뒤에만 이 값을 쓴다
    problem_title VARCHAR(200) NOT NULL,
    -- 신고 당시 공개 버전 번호. 버전은 문제와 함께 지워지므로 FK 없이 번호만 남긴다
    problem_version_no INTEGER NOT NULL CHECK (problem_version_no > 0),
    reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    report_type VARCHAR(16) NOT NULL
        CHECK (report_type IN ('STATEMENT', 'IO_DESCRIPTION', 'SAMPLE', 'TEST_CASE', 'TYPO', 'OTHER')),
    content VARCHAR(1000) NOT NULL CHECK (content <> ''),
    -- PROBLEM_DELETED는 처리 안 한 신고의 문제가 지워질 때 서버만 정한다(ReportRepository.markProblemDeleted)
    status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED'
        CHECK (status IN ('RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'PROBLEM_DELETED')),
    admin_memo VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- 관리자가 마지막으로 저장했거나 PROBLEM_DELETED가 된 시각. 아무도 손대지 않았으면 NULL
    updated_at TIMESTAMPTZ,
    -- 문제가 지워진 신고는 처리 안 한 상태로 남지 않는다(처리 안 한 신고 수에 잡히지 않게)
    CHECK (problem_id IS NOT NULL OR status IN ('RESOLVED', 'REJECTED', 'PROBLEM_DELETED'))
);

-- 관리자 목록은 상태로 거르고 최신순으로 본다
CREATE INDEX problem_reports_status_created_idx ON problem_reports (status, created_at DESC);
-- 문제를 지울 때 그 문제의 신고를 찾는다(markProblemDeleted)
CREATE INDEX problem_reports_problem_idx ON problem_reports (problem_id);
-- 회원 탈퇴 때 FK(SET NULL)가 그 사용자의 신고를 찾는다. 신고는 지우지 않고 쌓여 전체를 훑지 않게 한다
CREATE INDEX problem_reports_reporter_idx ON problem_reports (reporter_id);
