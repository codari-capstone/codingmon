# api

백엔드 (Spring Boot 4, Java 21, JPA, Flyway, PostgreSQL 18). 1주차에 프로젝트를 생성한다.
API, 채점 처리기, AI 처리기, 리포트 계산을 패키지로 나눈 하나의 애플리케이션이다.

## 채점 (Judge0)

`JUDGE0_URL`과 `JUDGE0_AUTHN_TOKEN`을 주면 채점 처리기가 켜진다(`.env.example`). 비워 두면 제출과 예제 실행이 `QUEUED`로 남는다. 로컬 Judge0는 [`judge/README.md`](../judge/README.md)의 "맥(Apple Silicon)에서 실행"으로 띄운다.

채점 통합 테스트(`JudgeWorkerIntegrationTest`)는 `JUDGE0_URL`이 있을 때만 돈다. 테스트 DB에 문제·제출을 만들었다가 지운다.

```bash
DB_URL=... DB_USERNAME=... DB_PASSWORD=... JUDGE0_URL=http://127.0.0.1:2358 JUDGE0_AUTHN_TOKEN=... ./gradlew test
```

## AI (LLM)

팀 서버에 띄운 오픈 웨이트 모델을 OpenAI 호환 API(`/v1/chat/completions`)로 부른다. `LLM_URL`과 `LLM_MODEL`을 주면 켜지고, 비워 두면 AI 기능이 장애로 응답한다. 채점에는 영향이 없다. 나머지 값과 기본값은 `application.properties`의 `app.llm.*`에 있다.

호출은 `AiWorker`가 채점 슬롯과 다른 스레드에서 처리한다. 동시 호출 수는 `LLM_WORKERS`로 정하고, 넘치는 요청은 `LLM_QUEUE_CAPACITY`까지 차례를 기다리며 그 뒤로는 바로 거절한다(`BUSY`). 응답 원문은 요청에 넣은 JSON 스키마(`$schema`가 없으면 draft 2020-12)로 검증하고, 어기면 한 번 다시 요청한다. 타임아웃·5xx·429에는 다시 부르지 않는다(응답을 못 받은 호출은 모델이 아직 만들고 있을 수 있다). 호출당 요금이 없어 `ai_reviews`에는 토큰 수만 남기고 `cost_usd`는 비워 둔다.

지금 모델은 `gemma4:12b`이고 서버 설정은 [`infra/README.md`](../infra/README.md)의 "LLM 서버"에 있다. 실제 모델로 호출하는 테스트(`OpenAiCompatibleLlmClientIntegrationTest`)는 `LLM_URL`과 `LLM_MODEL`이 있을 때만 돈다.

```bash
LLM_URL=http://127.0.0.1:11434 LLM_MODEL=gemma4:12b ./gradlew test --tests 'com.codingmon.api.ai.*'
```

오답 분석(F1·F2) 프롬프트는 `src/main/resources/prompts/analysis-<버전>/`에 있고 `AnalysisPrompt`가 읽는다. 버전은 `LLM_PROMPT_VERSION_ANALYSIS`(기본 `v1`)이며 `ai_reviews.prompt_version`에 그대로 남는다. 프롬프트를 고치면 폴더를 새 버전으로 복사해 고치고 이 값을 올린다. 그래야 이전 프롬프트로 만든 결과를 재사용하지 않는다.

오답 분석은 `AnalysisService`가, 코드 리뷰는 `CodeReviewService`가 요청을 받으면 `ai_reviews`에 `PENDING` 행을 만들고 처리기에 넣는다. 처리기에 넣은 뒤의 흐름(정답 코드 검사, 걸리면 한 번 다시 만들기, 두 번 걸리면 차단 표시 저장, 통과하면 사실 검증)은 두 기능이 `AiReviewRunner`를 같이 쓴다. 끝나면 사실 검증(`FactCheck`)으로 고친 값과 검증 내역(`factCheck`)을 `content`에 담아 `COMPLETED`로, 실패하면 `FAILED`와 이유(`failure_reason`: `UNAVAILABLE`·`RATE_LIMITED`·`BUSY`·`INVALID_RESPONSE`·`INTERNAL`)로 바꾼다. 이유는 `LlmException.Kind`에서 오고, 모델과 상관없는 오류(입력 준비·결과 저장 실패)는 `INTERNAL`이다. 비공개 테스트 원문은 사실 검증에만 쓰고(`FactCheckRepository`) 모델 입력에는 넣지 않는다. 실제 모델 평가(`AnalysisPromptIntegrationTest`)는 응답마다 사실 검증이 무엇을 고쳤는지 `build/analysis-eval/summary.tsv`에 남긴다. 같은 제출·같은 프롬프트 버전의 결과는 다시 만들지 않는다. `FAILED`인 행과, 서버가 처리 중에 내려가 `PENDING`으로 남은 행은 다시 요청하면 같은 행으로 재시도한다. 남은 행은 시작하고 `LLM_PENDING_TIMEOUT`(기본 15분)이 지나면 실패로 보이는데, 이 서버의 대기열에 있거나 처리 중인 요청은 오래 걸려도 실패로 보지 않는다(`AiReviewRunner`가 처리 중인 행을 기억한다). 시각은 DB 시계로만 비교한다. 프롬프트 버전이 바뀌어 행이 여럿이면 요청·조회·힌트 열기가 같은 규칙(`AiReviewRepository.findShown`)으로 하나를 고른다. 결과는 그 시도를 시작한 `created_at`이 그대로일 때만 저장해, 늦게 끝난 이전 시도가 새 시도를 덮어쓰지 못한다.

하루 한도는 `AiQuotaService`가 센다. 분석과 리뷰를 합쳐 사용자당 `LLM_DAILY_LIMIT`(기본 20)회이고, 하루는 UTC 날짜다. 시도를 잡는 일(`AiReviewRepository.claim`)만 본인 제출 행과 사용자 행을 이 순서로 잠근 트랜잭션에서 하고(탈퇴·채점 완료와 같은 순서라 교착이 없다), 잡았으면 그 행까지 세어 넘으면 429 `AI_DAILY_LIMIT_EXCEEDED`를 던져 롤백한다. 같은 사용자의 요청이 잠금에서 줄을 서므로 동시에 눌러도 한도를 넘지 않는다. 처리기에는 이 트랜잭션이 커밋된 뒤에 넣는다. 커밋 전에 넣으면 처리기가 `PENDING` 행을 못 봐 결과를 버린다. 세는 기준은 [`docs/database-schema.md`](../docs/database-schema.md)에 있다.

`AnalysisPromptIntegrationTest`는 판정별 오답 샘플(`AnalysisSamples`)을 실제 모델에 보내 스키마, 줄 번호 범위, 코드·정답 조각 유출, 마크다운·영어 값 이름이 섞였는지 본다. 응답 원문과 걸린 시간은 `build/analysis-eval/`에 남으니 힌트 내용은 사람이 읽고 평가한다.

정답 코드 리뷰(F3) 프롬프트는 `src/main/resources/prompts/code-review-<버전>/`의 `system.md`(정답 코드 검사에 걸려 다시 만들 때는 뒤에 `retry.md`를 붙인다)이고 `CodeReviewPrompt`가 읽는다. 정답 제출만 리뷰하므로 판정별 지시는 없다. 버전은 `LLM_PROMPT_VERSION_CODE_REVIEW`(기본 `v1`)이고 고치는 방법은 오답 분석과 같다. 입력(`CodeReviewInput`)은 `AnalysisInput`에서 문제와 제출만 가져온다. 예제와 비공개 테스트는 모두 통과했으므로 보내지 않는다. `CodeReviewPromptIntegrationTest`는 정답 샘플 5개(`CodeReviewSamples`)를 실제 모델에 보내고 응답 원문과 `summary.tsv`(걸린 시간, 토큰, 복잡도, 기대한 `meetsIntended`, 정답 코드 검사 결과)를 `build/code-review-eval/`에 남긴다. 복잡도 추정, 개선점, 다음 개념은 사람이 읽고 평가한다.
