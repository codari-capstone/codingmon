# 데이터베이스 테이블·컬럼 설명

이 문서는 [DB 스키마 초안](database-schema.md)과 Flyway 마이그레이션을 기준으로 각 컬럼의 역할을 정리한다.

- **PK**: 테이블에서 행 하나를 구별하는 기본 키
- **FK**: 다른 테이블의 행을 가리키는 외래 키
- **중복 불가**: 같은 값을 가진 행을 둘 이상 만들 수 없음
- **비어도 됨**: 값이 아직 없거나 해당하지 않을 때 `NULL`을 저장할 수 있음

## `users` — 서비스 사용자

- `id` (PK): 서비스 내부에서 사용자를 구별하는 번호. 다른 사용자 관련 테이블이 이 번호를 참조한다.
- `email` (비어도 됨, 중복 불가): 일반 회원가입·로그인에 쓰는 이메일. OAuth 계정에서 이메일을 받지 못하면 비워둘 수 있다. 대소문자만 다른 이메일도 중복으로 취급한다.
- `password_hash` (비어도 됨): 일반 회원가입 비밀번호의 해시값. 평문 비밀번호를 저장하지 않는다. 일반 가입 계정은 이메일도 있어야 한다.
- `nickname` (중복 불가): 서비스 화면에서 다른 사람에게 보이는 별명(닉네임).
- `avatar_url` (비어도 됨): 프로필 이미지 주소.
- `role`: 권한 구분. `USER`는 일반 사용자, `ADMIN`은 관리자이며 기본값은 `USER`다.

## `oauth_accounts` — OAuth 계정 연결

- `id` (PK): OAuth 연결 행의 내부 번호.
- `user_id` (FK): 연결되는 서비스 사용자(`users.id`). 사용자를 삭제하면 연결도 삭제된다.
- `provider`: OAuth 제공자. 현재 허용값은 `GITHUB`다.
- `provider_user_id`: GitHub가 해당 계정에 부여한 고유 ID. GitHub 사용자명이 바뀌어도 계정을 찾는 데 사용한다.
- `provider_username` (비어도 됨): OAuth 로그인 시점에 받은 GitHub 사용자명. 화면 표시나 참고용이며 계정 식별 기준은 아니다.
- `(provider, provider_user_id)` 중복 불가: 같은 GitHub 계정을 서비스 사용자 여러 명에게 연결하지 못하게 한다.
- `(user_id, provider)` 중복 불가: 한 사용자가 같은 제공자 계정을 여러 개 연결하지 못하게 한다.

## `refresh_tokens` — 로그인 유지 토큰

- `id` (PK): 갱신 토큰 행의 내부 번호.
- `user_id` (FK): 토큰을 발급받은 사용자. 사용자를 삭제하면 해당 토큰도 삭제된다.
- `token_hash` (중복 불가): refresh token 원문이 아닌 해시값. 로그인 유지와 토큰 검증에 사용한다.
- `family_id`: 서로 교체된 토큰들을 한 묶음으로 식별하는 ID. 토큰 재사용이 의심될 때 묶음 전체를 폐기하는 데 쓴다.
- `expires_at`: 토큰 만료 시각.
- `revoked_at` (비어도 됨): 토큰을 로그아웃 등으로 폐기한 시각. 아직 유효하면 비어 있다.
- `replaced_by_token_id` (비어도 됨, FK, 중복 불가): 이 토큰을 교체한 새 토큰의 `id`. 교체되지 않았으면 비어 있다.
- `created_at`: 토큰 행이 만들어진 시각. 기본값은 DB의 현재 시각이다.

## `problems` — 문제의 고정 정보

- `id` (PK): 서비스 내부 문제 번호.
- `slug` (중복 불가): URL 등에 쓸 수 있는 문제 식별 문자열. 제목이나 지문이 바뀌어도 문제 자체를 구별한다.
- `created_at`: 문제 행이 만들어진 시각. 기본값은 DB의 현재 시각이다.

## `problem_versions` — 문제 콘텐츠 버전

- `id` (PK): 문제 버전의 내부 번호.
- `problem_id` (FK): 이 버전이 속한 문제(`problems.id`).
- `version_no`: 해당 문제의 버전 번호. 1부터 시작한다.
- `title`: 문제 제목.
- `difficulty`: 난이도. `EASY`, `MEDIUM`, `HARD` 중 하나다.
- `statement_markdown`: 문제 지문. Markdown 형식으로 저장한다.
- `input_description`: 입력 형식 설명.
- `output_description`: 출력 형식 설명.
- `constraints_markdown`: 입력 범위 등 제약 조건 설명. 비어 있으면 빈 문자열을 저장한다.
- `source_name` (비어도 됨): 문제 출처 이름.
- `source_url` (비어도 됨): 원문 또는 출처 링크.
- `license` (비어도 됨): 문제 콘텐츠의 라이선스.
- `status`: 편집·공개 상태. `DRAFT`, `VALIDATING`, `PUBLISHED`, `RETIRED` 중 하나다.
- `published_at` (비어도 됨): 공개한 시각. 아직 공개하지 않았으면 비어 있다.
- `created_at`: 이 버전 행이 만들어진 시각.
- `(problem_id, version_no)` 중복 불가: 한 문제 안에서 버전 번호가 겹치지 않게 한다.
- `(id, problem_id)` 중복 불가: 추천 기록 등이 버전과 그 소속 문제를 한 번에 참조하도록 하는 연결 규칙이다.

## `problem_language_configs` — 언어별 문제 설정

- `problem_version_id` (복합 PK의 일부, FK): 설정이 적용되는 문제 버전. 버전을 삭제하면 설정도 삭제된다.
- `language` (복합 PK의 일부): 프로그래밍 언어. 현재 허용값은 `PYTHON`, `CPP`다.
- `(problem_version_id, language)` 복합 PK: 같은 버전에 같은 언어 설정을 두 번 만들지 못하게 한다.
- `time_limit_ms`: 해당 언어의 시간 제한(밀리초). 0보다 커야 한다.
- `memory_limit_mb`: 해당 언어의 메모리 제한(MB). 0보다 커야 한다.
- `starter_code`: 에디터에서 시작 코드로 보여 줄 코드. 기본값은 빈 문자열이다.

## `concept_tags` — 개념 태그 목록

- `id` (PK): 개념 태그 내부 번호.
- `slug` (중복 불가): 코드나 URL에서 안정적으로 사용할 태그 식별 문자열.
- `name` (중복 불가): 화면에 표시할 태그 이름.

## `problem_version_tags` — 문제 버전과 태그 연결

- `problem_version_id` (복합 PK의 일부, FK): 태그가 붙는 문제 버전. 버전을 삭제하면 연결도 삭제된다.
- `concept_tag_id` (복합 PK의 일부, FK): 연결할 개념 태그.
- `(problem_version_id, concept_tag_id)` 복합 PK: 같은 태그를 한 버전에 중복으로 붙이지 못하게 한다.

## `test_cases` — 공개 예제와 채점 테스트

- `id` (PK): 테스트 케이스 내부 번호.
- `problem_version_id` (FK): 케이스가 속한 문제 버전. 버전을 삭제하면 케이스도 삭제된다.
- `ordinal`: 해당 버전 안에서의 케이스 순서. 1부터 시작하며 버전 안에서 중복될 수 없다.
- `case_type`: 공개 예제인지 비공개 채점 케이스인지 구분한다. `SAMPLE` 또는 `HIDDEN`이다.
- `input_data`: 프로그램에 전달할 입력 데이터.
- `expected_output`: 정답 프로그램이 내야 하는 출력.
- `created_at`: 테스트 케이스가 만들어진 시각.
- `(id, problem_version_id)` 중복 불가: 제출 결과가 다른 버전의 테스트 케이스를 잘못 참조하지 않도록 하는 연결 규칙이다.

비공개 케이스의 실제 입력·기대 출력은 공개 저장소에 커밋하지 않는다. 사용자 API에도 반환하지 않는다.

## `reference_solutions` — 내부 검증용 정답 코드

- `id` (PK): 정답 코드 행의 내부 번호.
- `problem_version_id` (FK): 코드가 검증하는 문제 버전. 버전을 삭제하면 코드도 삭제된다.
- `language`: 코드 언어. `PYTHON`, `CPP` 중 하나다.
- `solution_role`: 코드의 용도. `REFERENCE` 또는 `BRUTE`다.
- `source_code`: 내부 검증용 코드. 사용자에게 제공하지 않는다.
- `verified_at` (비어도 됨): 정답 코드 검증이 끝난 시각.
- `(problem_version_id, language, solution_role)` 중복 불가: 한 버전·언어·역할 조합에 같은 종류의 코드를 하나만 둔다.

## `submissions` — 예제 실행과 사용자 제출

- `id` (PK): 실행 또는 제출의 내부 번호.
- `user_id` (FK): 실행을 한 사용자.
- `problem_version_id` (FK): 실행한 문제 버전.
- `submission_kind`: `SAMPLE_RUN`은 공개 예제 실행, `SUBMIT`은 실제 채점 제출이다.
- `language`: 제출 코드 언어. `PYTHON`, `CPP` 중 하나다.
- `source_code`: 실행한 코드.
- `judge_job_id` (비어도 됨): 채점 서버가 반환한 작업 ID.
- `job_status`: 처리 단계. `QUEUED`, `COMPILING`, `RUNNING`, `COMPLETED`, `JUDGE_ERROR` 중 하나다.
- `progress`: 채점 진행률(0~100).
- `verdict` (비어도 됨): 최종 판정. `ACCEPTED`, `PRESENTATION_ERROR`, `WRONG_ANSWER`, `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, `OUTPUT_LIMIT_EXCEEDED`, `RUNTIME_ERROR`, `COMPILE_ERROR` 중 하나다. 아직 판정 전이거나 채점 서버 오류면 비어 있을 수 있다.
- `runtime_error_type` (비어도 됨): 런타임 오류의 세부 종류.
- `compiler_message` (비어도 됨): 컴파일 오류 설명.
- `execution_time_ms` (비어도 됨): 전체 실행 시간(밀리초).
- `memory_used_kb` (비어도 됨): 사용 메모리(KB).
- `submitted_at`: 실행 또는 제출 시각.
- `judged_at` (비어도 됨): 채점이 끝난 시각.
- `(id, user_id)` 중복 불가: AI 사용 기록에서 제출 소유자를 함께 확인하는 연결 규칙이다.
- `(id, problem_version_id)` 중복 불가: 테스트 결과가 제출과 같은 문제 버전을 참조하게 하는 연결 규칙이다.
- `judge_job_id` 중복 불가(값이 있을 때): 한 채점 작업을 여러 제출에 연결하지 못하게 한다.

## `submission_test_results` — 제출별 케이스 판정

- `id` (PK): 케이스 결과 행의 내부 번호.
- `submission_id` (FK): 결과가 속한 제출.
- `problem_version_id`: 제출과 케이스가 같은 버전인지 확인하는 데 쓰는 문제 버전 번호.
- `test_case_id` (FK): 판정한 테스트 케이스.
- `verdict`: 해당 케이스의 판정. 완료 실행 결과만 저장하므로 컴파일 오류는 포함하지 않는다.
- `execution_time_ms` (비어도 됨): 해당 케이스의 실행 시간.
- `memory_used_kb` (비어도 됨): 해당 케이스의 메모리 사용량.
- `(submission_id, test_case_id)` 중복 불가: 같은 케이스의 결과를 같은 제출에 두 번 기록하지 못하게 한다.
- 복합 FK 두 개: 제출과 테스트 케이스가 같은 문제 버전에 속하는지 확인한다.

케이스별 결과는 내부 채점용이다. 숨겨진 케이스 번호, 실패 여부, 입력·기대 출력은 사용자에게 노출하지 않는다.

## `ai_reviews` — AI 분석·코드 리뷰

- `id` (PK): AI 결과 행의 내부 번호.
- `submission_id` (FK): 분석하거나 리뷰한 제출. 제출을 삭제하면 결과도 삭제된다.
- `review_type`: `ANALYSIS`는 오답 분석·힌트, `CODE_REVIEW`는 정답 코드 리뷰다.
- `prompt_version`: 결과를 만든 프롬프트의 버전.
- `model`: 사용한 AI 모델 이름.
- `status`: `PENDING`, `COMPLETED`, `FAILED` 중 하나.
- `content` (비어도 됨): 설명·힌트를 담은 구조화 JSON. 완료 전에는 비어 있을 수 있다.
- `input_tokens`, `output_tokens` (비어도 됨): AI 요청·응답 토큰 수.
- `cost_usd` (비어도 됨): 해당 AI 처리 비용(미국 달러).
- `revealed_hint_level`: 사용자가 공개한 힌트 단계(0~3).
- `created_at`: AI 결과 행을 만든 시각.
- `completed_at` (비어도 됨): 처리가 끝난 시각.
- `(submission_id, review_type, prompt_version)` 중복 불가: 같은 제출·기능·프롬프트 결과를 재사용하게 한다.

## `review_feedback` — AI 결과 피드백

- `id` (PK): 피드백 행의 내부 번호.
- `ai_review_id` (FK, 중복 불가): 평가한 AI 결과. 결과 하나당 피드백은 하나만 둘 수 있다.
- `helpful`: 사용자에게 도움이 되었는지 여부.
- `reason` (비어도 됨): 도움이 된 이유나 아쉬운 점.
- `created_at`: 피드백을 남긴 시각.

## `user_problem_stats` — 사용자별 문제 풀이 통계

- `user_id` (복합 PK의 일부, FK): 통계를 소유한 사용자.
- `problem_id` (복합 PK의 일부, FK): 통계를 계산할 문제.
- `(user_id, problem_id)` 복합 PK: 사용자마다 문제별 통계 행 하나만 둔다.
- `solved`: 정답을 맞힌 적이 있는지.
- `first_solved_at` (비어도 됨): 처음 정답을 맞힌 시각.
- `attempt_count`: 통계에 포함할 실제 채점 제출 수. 예제 실행과 채점 서버 오류는 제외한다.
- `revealed_hint_level_sum`: 힌트를 공개한 제출들의 공개 단계 합계.
- `hinted_submission_count`: 힌트를 한 번 이상 공개한 제출 수. 현재 평균 힌트 단계는 합계를 이 수로 나눈다.
- `updated_at`: 집계값을 마지막으로 갱신한 시각.

## `learning_reports` — 날짜별 학습 리포트

- `id` (PK): 리포트 내부 번호.
- `user_id` (FK): 리포트를 소유한 사용자. 사용자를 삭제하면 리포트도 삭제된다.
- `report_date`: 하루 제한을 적용할 기준 날짜.
- `status`: `PENDING`, `COMPLETED`, `FAILED` 중 하나.
- `statistics`: 서버가 계산한 통계 JSON.
- `content` (비어도 됨): AI가 작성한 리포트 내용 JSON. 완료 전에는 비어 있을 수 없다.
- `model` (비어도 됨): 리포트를 만든 AI 모델.
- `generated_at`: 리포트 생성 요청 행을 만든 시각.
- `(user_id, report_date)` 중복 불가: 사용자별 하루 한 건만 허용한다.
- `(id, user_id)` 중복 불가: AI 사용 기록이 리포트 소유자를 함께 확인하는 연결 규칙이다.

## `learning_report_recommendations` — 리포트 추천 문제

- `learning_report_id` (복합 PK의 일부, FK): 추천이 포함된 리포트. 리포트를 삭제하면 추천도 삭제된다.
- `rank` (복합 PK의 일부): 추천 순위(1~3).
- `(learning_report_id, rank)` 복합 PK: 한 리포트 안에서 같은 순위를 중복할 수 없다.
- `problem_id`: 추천 대상 문제.
- `problem_version_id`: 사용자에게 연결할 문제 버전.
- `concept_tag_id` (비어도 됨): 추천 이유가 연결된 취약 개념 태그.
- `reason`: 이 문제를 추천한 이유.
- `(learning_report_id, problem_id)` 중복 불가: 같은 문제를 한 리포트에 두 번 추천하지 못하게 한다.
- 복합 FK: 지정한 문제 버전이 그 문제에 속하고, 지정한 태그가 그 버전에 실제 연결돼 있는지 확인한다.

## `ai_usage_events` — 실제 AI 호출 사용량

- `id` (PK): 호출 기록 행의 내부 번호.
- `user_id` (FK): 호출한 사용자. 사용자를 삭제하면 기록도 삭제된다.
- `request_type`: `ANALYSIS`, `CODE_REVIEW`, `REPORT` 중 호출 기능.
- `submission_id` (비어도 됨, 복합 FK): 분석·리뷰 대상 제출. 제출 소유자도 함께 확인한다.
- `learning_report_id` (비어도 됨, 복합 FK): 생성 요청한 리포트. 리포트 소유자도 함께 확인한다.
- `outcome`: 모델 호출 결과인 `SUCCEEDED` 또는 `FAILED`.
- `provider_request_id` (비어도 됨): AI 제공자가 반환한 요청 ID.
- `input_tokens`, `output_tokens` (비어도 됨): 해당 호출의 토큰 수.
- `cost_usd` (비어도 됨): 해당 호출 비용(미국 달러).
- `created_at`: 모델 호출을 기록한 시각.
- 검사 규칙: 제출 또는 리포트 중 정확히 하나만 연결하고, `REPORT` 요청은 리포트에 연결한다.

## `invite_codes` — 초대 코드 발급

- `id` (PK): 초대 코드 행의 내부 번호.
- `code_hash` (중복 불가): 초대 코드 원문이 아닌 해시값.
- `created_by` (비어도 됨, FK): 코드를 발급한 관리자 사용자.
- `max_uses`: 허용할 최대 사용 횟수. 1 이상이어야 한다.
- `expires_at` (비어도 됨): 만료 시각. 비어 있으면 만료일을 두지 않는다.
- `created_at`: 코드를 발급한 시각.

## `invite_code_redemptions` — 초대 코드 사용 기록

- `invite_code_id` (복합 PK의 일부, FK): 사용한 초대 코드. 코드를 삭제하면 사용 기록도 삭제된다.
- `user_id` (복합 PK의 일부, FK, 전체 테이블에서 중복 불가): 초대 코드를 사용한 사용자. 한 사용자는 초대 코드를 한 번만 사용할 수 있다.
- `redeemed_at`: 코드를 사용한 시각.
- `(invite_code_id, user_id)` 복합 PK: 같은 사용 기록을 중복 저장하지 못하게 한다.

## 아직 정할 정책

- 일반 회원가입에서 이메일 인증과 비밀번호 재설정 기능을 제공할지. 현재는 이를 위한 만료 토큰 테이블이 없다.
- 일일 AI 한도에서 실패한 모델 호출도 횟수에 포함할지.
- 평균 힌트 단계를 계산할 때 힌트를 열지 않은 제출을 0단계로 포함할지.
- 리포트의 하루 기준 날짜에 사용할 시간대.
- 문제 공개 조건, 태그 1~3개, 언어별 설정 존재 여부처럼 여러 행을 봐야 하는 조건은 DB 제약이 아니라 게시·관리 서비스가 확인한다.
