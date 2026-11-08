package com.codingmon.api.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// 사실 검증(FactCheck)의 비공개 값 검사에 쓸 자료. 비공개 케이스의 입력·기대 출력 원문을 읽으므로 AnalysisInputRepository와
// 나눠 둔다(AnswerGuardRepository와 같은 이유). 모델에 보내는 입력에 원문이 섞일 길을 아예 만들지 않으려는 것이다.
// 학습자가 이미 볼 수 있는 글(지문·입출력 설명·제약, 공개 예제와 이 제출의 예제 실행 출력, 제출 코드, 컴파일 메시지)도 함께 읽는다.
// 비공개 값과 같아도 이 글에 있는 값은 누출이 아니다.
// 비공개 원문은 케이스마다 앞에서 HIDDEN_TEXT_MAX_CHARS까지만 읽는다. 응답 전체가 그보다 짧아 더 긴 값이 통째로 옮겨질 수 없다.
// 케이스는 실행 여부와 상관없이 그 문제 버전의 것을 모두 본다.
@Repository
class FactCheckRepository {

    static final int HIDDEN_TEXT_MAX_CHARS = 4_000;

    private final JdbcClient jdbc;

    FactCheckRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<FactCheck.Sources> find(long submissionId) {
        return jdbc.sql("select s.source_code, s.compiler_message,"
                + " concat_ws(E'\\n', v.title, v.statement_markdown, v.input_description, v.output_description,"
                + "   v.constraints_markdown) as problem_text,"
                + " array(select left(c.input_data, :max) from test_cases c"
                + "   where c.problem_version_id = v.id and c.case_type = 'HIDDEN' order by c.ordinal) as hidden_inputs,"
                + " array(select left(c.expected_output, :max) from test_cases c"
                + "   where c.problem_version_id = v.id and c.case_type = 'HIDDEN' order by c.ordinal) as hidden_outputs,"
                + " array(select concat_ws(E'\\n', c.input_data, c.expected_output, r.stdout, r.stderr) from test_cases c"
                + "   left join submission_test_results r on r.test_case_id = c.id and r.submission_id = s.id"
                + "   where c.problem_version_id = v.id and c.case_type = 'SAMPLE' order by c.ordinal) as samples"
                + " from submissions s join problem_versions v on v.id = s.problem_version_id"
                + " where s.id = :id")
                .param("id", submissionId)
                .param("max", HIDDEN_TEXT_MAX_CHARS)
                .query((rs, n) -> {
                    List<String> hidden = new ArrayList<>(List.of((String[]) rs.getArray("hidden_inputs").getArray()));
                    hidden.addAll(List.of((String[]) rs.getArray("hidden_outputs").getArray()));
                    List<String> open = new ArrayList<>(List.of((String[]) rs.getArray("samples").getArray()));
                    open.add(rs.getString("problem_text"));
                    open.add(rs.getString("source_code"));
                    open.add(rs.getString("compiler_message"));
                    return new FactCheck.Sources(hidden, open);
                })
                .optional();
    }
}
