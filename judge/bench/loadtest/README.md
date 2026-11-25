# 부하테스트 (k6)

동시 N명이 문제를 풀어 제출하고 AI 리뷰를 요청할 때 채점 대기와 AI 대기를 잰다(#14). 결과는 [`../results/2026-11-18-load-test.md`](../results/2026-11-18-load-test.md)에 있다.

| 파일 | 내용 |
|---|---|
| `loadtest.js` | 사용자 N명이 문제 목록 → 문제 → 예제 실행 → 제출 → 채점 결과 → AI 리뷰를 한 번씩 진행한다. 정답이면 코드 리뷰, 아니면 오답 분석을 요청한다 |
| `check.js` | 본 측정 전에 `pool.json`의 코드를 하나씩 제출해 예상 판정과 맞는지 본다. AI는 부르지 않는다 |
| `pool.json` | 사용자에게 나눠 줄 코드 묶음. **저장소에 넣지 않는다**(아래 "코드 묶음") |

## 준비

모든 명령은 API 서버(app VM)의 `infra` 폴더에서 실행한다.

### 1. DB 백업

```bash
docker compose exec -T db pg_dump -U codingmon -Fc codingmon > ~/before-loadtest.dump
```

### 2. 테스트 계정

API로 가입하면 이메일 인증이 필요하고 인증 메일은 IP당 하루 20회라, DB에 직접 넣는다. 비밀번호는 직접 정하고 저장소에 적지 않는다.

```bash
# 비밀번호 해시 만들기 (Spring DelegatingPasswordEncoder 형식)
htpasswd -bnBC 10 "" '<비밀번호>' | tr -d ':\n' | sed 's/^\$2y/{bcrypt}$2a/'
```

```sql
INSERT INTO users (email, password_hash, nickname)
SELECT format('lt%s@loadtest.local', lpad(i::text, 3, '0')), '<위에서 만든 해시>', format('lt%s', lpad(i::text, 3, '0'))
FROM generate_series(1, 100) AS i;
```

### 3. 테스트하는 동안만 바꾸는 한도

`infra/.env`를 백업하고 두 줄을 더한 뒤 API만 다시 띄운다.

```bash
cp .env .env.before-loadtest
printf 'LLM_QUEUE_CAPACITY=100\nJUDGE_PENDING_LIMIT=200\n' >> .env
docker compose up -d api
```

- `LLM_QUEUE_CAPACITY`: 기본 20이면 처리 중 5 + 줄 20 = 25명을 넘는 요청이 바로 BUSY가 된다. 대기 시간을 재려고 늘린다.
- `JUDGE_PENDING_LIMIT`: 100명이 예제 실행과 제출을 함께 내면 기본 100에 닿는다.
- AI 하루 한도(`LLM_DAILY_LIMIT_FREE`, 무료 계정당 3회)는 측정 1회에 계정당 1회만 쓰므로 그대로 둔다.

### 4. 코드 묶음 (`pool.json`)

정답 코드와 정답에 가까운 오답이 들어가므로 저장소(공개)에 넣지 않는다. 운영 DB에서 뽑아 만든다.

- 정답: 테스트 계정을 뺀 실제 `ACCEPTED` 제출(참고 정답을 그대로 복사한 것은 뺀다). 모자란 문제는 `reference_solutions`의 참고 정답으로 채운다.
- 오답: 실제 틀린 제출 중 빈 템플릿이나 대충 낸 코드를 뺀 것. 모자라면 참고 정답에 학습자가 흔히 하는 실수를 하나씩 넣어 만든다.
- 형식은 아래 객체의 배열이다. `expect`는 `ACCEPTED` 또는 `WRONG`이다.

```json
{ "key": 0, "problemId": 16, "language": "PYTHON", "sourceCode": "...", "expect": "ACCEPTED", "origin": "human", "note": "submission 41" }
```

참고 정답은 이렇게 뽑는다.

```bash
docker compose exec -T db psql -U codingmon -d codingmon -At -c "
SELECT json_agg(json_build_object('problemId', pv.problem_id, 'title', pv.title,
       'language', rs.language, 'sourceCode', rs.source_code) ORDER BY pv.problem_id, rs.language)
FROM reference_solutions rs JOIN problem_versions pv ON pv.id = rs.problem_version_id
WHERE pv.status = 'PUBLISHED' AND rs.solution_role = 'REFERENCE';" > ~/refs.json
```

## 실행

`loadtest.js`, `check.js`, `pool.json`을 app VM의 한 폴더에 두고 그 폴더에서 실행한다. k6 컨테이너는 자기 사용자로 돌아 홈 폴더(권한 750)를 읽지 못하므로 `-u`로 내 계정을 준다. API 포트는 게시되어 있지 않아 compose 네트워크(`codingmon_default`)에 붙는다.

```bash
# 사전 확인: 마지막 줄의 SKIP=... 값을 본 측정에 넘긴다
docker run --rm -u "$(id -u):$(id -g)" --network codingmon_default -v "$PWD":/lt -w /lt \
  -e PASSWORD='<비밀번호>' grafana/k6:0.54.0 run check.js 2>&1 | grep -E "OK  |DIFF|SKIP=|error"

# 본 측정
docker run --rm -u "$(id -u):$(id -g)" --network codingmon_default -v "$PWD":/lt -w /lt \
  -e PASSWORD='<비밀번호>' -e VUS=30 -e SKIP=<check.js 결과> \
  grafana/k6:0.54.0 run --summary-export=result-30.json loadtest.js 2>&1 | tail -25
```

| 환경 변수 | 기본값 | 내용 |
|---|---|---|
| `PASSWORD` | 없음(필수) | 테스트 계정 비밀번호 |
| `VUS` | 10 | 동시 사용자 수. `lt001`부터 차례로 쓴다 |
| `SKIP` | 없음 | 뺄 `pool.json`의 `key` 목록(쉼표 구분) |
| `BASE_URL` | `http://api:8080` | API 주소 |
| `MAX_DURATION` | `90m` | 측정 최대 시간. AI 대기 상한(60분)에 앞 단계(최대 약 21분)를 더한 것보다 길게 둔다 |

- 결과 지표: `wait_sample_run`, `wait_judge`, `wait_ai_code_review`, `wait_ai_analysis`(대기 시간), `ai_busy`, `ai_failed`, `judge_queue_full`, `judge_error`, `unexpected`(예상과 다른 응답).
- AI는 결과를 최대 60분 기다린다. 100명이면 30분 넘게 걸린다. 로그인 토큰(30분)이 만료되면 다시 로그인한다.
- 서버 상태는 각 VM에서 `vmstat -t 5`, llm VM에서 `nvidia-smi --query-gpu=timestamp,utilization.gpu,memory.used --format=csv -l 5`로 함께 기록했다.

## 되돌리기

```bash
cp .env.before-loadtest .env && docker compose up -d api
docker compose exec -T db psql -U codingmon -d codingmon -c "DELETE FROM users WHERE email LIKE '%@loadtest.local';"
```

테스트 계정을 지우면 그 계정의 제출·채점 결과·AI 리뷰도 함께 지워진다(`ON DELETE CASCADE`). 테스트 전 상태로 정확히 되돌리려면 1의 백업으로 복원한다. 복원하면 백업 뒤에 생긴 데이터(다른 사용자의 로그인 토큰 등)도 사라진다.

```bash
docker compose stop api
docker compose exec -T db pg_restore -U codingmon -d codingmon --clean --if-exists < ~/before-loadtest.dump
docker compose start api
```

Judge0는 judge VM에 자기 DB를 따로 두므로 테스트 제출 기록이 거기에 남는다.
