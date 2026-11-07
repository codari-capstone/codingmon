package com.codingmon.api.ai;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// 정답 코드 검사(AnswerGuard)에 쓸 자료. 검증 정답 코드(reference_solutions)를 읽으므로 AnalysisInput과 나눠 둔다.
// 모델에 보내는 입력에 정답 코드가 섞일 길을 아예 만들지 않으려는 것이다. 지문과 학습자 코드는 자르지 않고 원문 그대로 읽는다.
// 정답 코드는 검증을 마쳤는지와 상관없이 그 버전의 것을 모두 본다. 검증 전 코드라도 정답에 가까우면 흘리면 안 된다.
@Repository
class AnswerGuardRepository {

    private final JdbcClient jdbc;

    AnswerGuardRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<AnswerGuard.Context> find(long submissionId) {
        return jdbc.sql("select s.source_code,"
                + " concat_ws(E'\\n', v.title, v.statement_markdown, v.input_description, v.output_description,"
                + "   v.constraints_markdown) as problem_text,"
                + " array(select t.name from problem_version_tags pvt join concept_tags t on t.id = pvt.concept_tag_id"
                + "   where pvt.problem_version_id = v.id order by t.id) as tags,"
                + " array(select r.source_code from reference_solutions r where r.problem_version_id = v.id"
                + "   order by r.id) as solutions"
                + " from submissions s join problem_versions v on v.id = s.problem_version_id"
                + " where s.id = :id")
                .param("id", submissionId)
                .query((rs, n) -> new AnswerGuard.Context(rs.getString("source_code"), rs.getString("problem_text"),
                        List.of((String[]) rs.getArray("tags").getArray()),
                        List.of((String[]) rs.getArray("solutions").getArray())))
                .optional();
    }
}
