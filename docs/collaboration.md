# 협업 규칙 — codingmon

Oct 3, 2026 · @찬우 · 최종 갱신 Oct 6, 2026

팀 전체 규칙은 조직 저장소의 **[CONTRIBUTING.md](https://github.com/codari-capstone/.github/blob/main/CONTRIBUTING.md)** 하나를 기준으로 삼는다. 브랜치 전략, 커밋 형식, PR·리뷰 규칙, 넣으면 안 되는 것이 거기에 있다.

이 문서는 **`codingmon` 저장소에만 해당하는 것**을 담는다. 조직 문서와 겹치는 내용은 적지 않는다. 한쪽만 고쳐져 어긋나는 일을 막기 위해서다.

> 실제로 어긋난 적이 있다. 2026-10-06까지 이 문서는 커밋 형식을 `타입: 설명 (#번호)`로 적고 있었다. 조직 규칙은 `type(scope): 요약`이다. 그 사이 올라간 PR 제목들이 조직 형식을 벗어났다.

## 1. 조직 규칙에서 자주 쓰는 것

전문은 조직 CONTRIBUTING에 있다. 자주 보는 것만 요약한다.

| 항목 | 규칙 |
| --- | --- |
| 브랜치 이름 | `feature/<이슈번호>-<짧은-설명>` (영어 소문자·하이픈) |
| 병합 방식 | `feature` → `develop`은 **Squash**, `develop` → `main`은 **Merge commit** |
| 커밋·PR 제목 | `type(scope): 요약` — type·scope는 영어 소문자, 요약은 한국어 |
| 이슈 연결 | **PR 본문**에 `Closes #12` (커밋 메시지가 아니다) |
| 승인 | 팀원 1명. `contracts/`를 바꾸는 PR은 3명 모두 확인 |
| 리뷰 응답 | 요청받으면 하루 안에 확인 |

Squash 병합이라 **PR 제목이 그대로 `develop`의 커밋 메시지가 된다.** PR 제목에 형식을 반드시 지킨다.

### 병합 조건 (이 저장소에서 더 지키는 것)

ruleset이 막아 주는 것은 PR 필수와 승인 1명까지다. 아래 둘은 **설정이 강제하지 않으므로 사람이 지킨다.**

1. **CI 통과** — PR의 `verify` 검사가 초록일 때 병합한다. 지금 ruleset에 필수 상태 검사가 걸려 있지 않아, 실패한 채로도 병합이 가능하다 (7장 미결 항목)
2. **모든 리뷰 대화 해결(Resolve)** — `main`은 ruleset이 강제하지만 `develop`은 꺼져 있다

조직 CONTRIBUTING에는 이 둘이 없다. 여기 적어 두는 이유다.

### 이 저장소에서 쓰는 scope

scope 목록은 [조직 CONTRIBUTING의 scope 표](https://github.com/codari-capstone/.github/blob/main/CONTRIBUTING.md#scope)에 있다. 여기 옮겨 적으면 한쪽만 낡는다.

이 저장소에서만 알아 둘 것:

- `web` `api` `judge` `infra` `contracts` `docs`는 같은 이름의 폴더에 대응한다
- `content`는 문제·테스트용 scope인데, 그 파일들은 비공개 `problems` 저장소에 있다. 이 저장소에서는 쓸 일이 거의 없다
- `ai`는 폴더가 아니다. AI 분석·힌트·리뷰·리포트에 걸친 변경에 쓴다 (프롬프트는 `api/src/main/resources/prompts/`)
- 여러 영역에 걸친 변경은 scope를 생략한다

## 2. 이슈·일정 관리

모든 작업은 GitHub 이슈로 만들고, Projects 보드 하나에서 진행 상황을 본다. 이슈 템플릿(기능 / 버그 / 작업)은 조직 저장소에 있어 자동으로 적용된다.

### 이슈 작성

- 제목은 분류를 앞에 붙인다. 조직 이슈 템플릿이 자동으로 채워 주는 접두어를 그대로 쓴다 — 기능은 `[feat] `, 버그는 `[fix] `, 작업은 `[task] `. 예: `[feat] 문제 목록 화면 (검색·필터)`, `[task] Judge0 설치·언어별 실측`, `[fix] 채점 완료 후 폴링이 멈추지 않음`
- 기능명세서에 있는 작업은 본문에 ID를 적는다 (`LIST-01~05`처럼).
- 이슈 하나는 2~3일 안에 끝낼 수 있는 크기로 나눈다.

### 라벨

| 종류 | 라벨 |
| --- | --- |
| 유형 | `type:feat` `type:fix` `type:refactor` `type:style` `type:docs` `type:test` `type:chore` |
| 영역 | `area:web` `area:api` `area:judge` `area:ai` `area:infra` `area:content` `area:docs` |
| 우선순위 | `priority:P0` (이번 주 반드시) · `priority:P1` (이번 마일스톤 안에) · `priority:P2` (여유 있을 때) |
| 상태 | `blocked` (다른 작업을 기다리는 중) · `question` (논의 필요) |

유형 라벨 7개는 커밋 `type` 7개와 이름이 같다. 영역 라벨은 대체로 `scope`와 같지만 완전히 겹치지는 않는다 — `contracts`·`release` scope에는 대응하는 영역 라벨이 없고, `area:content`에 대응하는 scope는 이 저장소에서 거의 쓰이지 않는다(1장 참고). 애매하면 라벨은 영역 기준, scope는 바뀐 폴더 기준으로 고른다.

### Projects 보드

| 칸 | 의미 |
| --- | --- |
| Backlog | 아직 일정을 정하지 않은 작업 |
| Todo | 이번 주에 할 작업 |
| In Progress | 브랜치를 만들고 진행 중 |
| In Review | PR을 올리고 리뷰 대기 중 |
| Done | 병합 완료 |

### 마일스톤

| 마일스톤 | 기한 |
| --- | --- |
| M1. 제출 → 판정·쉬운 설명 | 2026-10-25 |
| M2. AI 분석 → 단계별 힌트 → 재제출 | 2026-11-08 |
| M3. 학습 리포트·추천 포함 MVP 고정 | 2026-11-15 |
| M4. AWS 배포·사용자 검증 | 2026-11-29 |
| M5. 최종 발표 | 2026-12-06 |

모든 이슈를 마일스톤 하나에 연결한다. 마일스톤을 마치면 `develop` → `main` 릴리스 PR을 열고 제목을 `chore(release): M1 제출 → 판정`처럼 쓴다.

## 3. PR·리뷰에서 이 저장소가 더 지키는 것

조직 규칙에 없는 관례다.

### PR 올리는 사람

- 변경량은 되도록 400줄 이하로 유지한다(자동 생성 파일 제외). 커지면 이슈를 나눈다.
- 작업 중에 의견을 받고 싶으면 **Draft PR**로 올린다.
- 작업 중 `develop`이 바뀌면 `git merge develop`으로 내 브랜치에 반영한 뒤 PR을 올린다. **충돌은 브랜치 주인이 해결한다.** 상대 코드가 걸리면 그 팀원과 함께 확인한다.
- 조건을 만족하면 **작성자가 직접 병합**하고, 리뷰어를 기다리게 두지 않는다.

### 리뷰 의견 쓰기

의견에 접두어를 붙여 무게를 알린다.

| 접두어 | 의미 |
| --- | --- |
| `[필수]` | 고치지 않으면 승인하지 않음 (버그, 보안, 명세 불일치) |
| `[제안]` | 더 나은 방법 제안. 반영 여부는 작성자가 결정 |
| `[질문]` | 이해를 위한 질문 |

- 코드를 평가하고 사람을 평가하지 않는다. '왜 이렇게 했어요?'보다 '이 부분은 ~하면 어떨까요?'로 쓴다.
- 리뷰어는 가능한 한 다른 분야 팀원도 돌아가며 맡는다. 서로의 코드를 알아야 발표와 장애 대응이 수월하다.

### 릴리스 (`develop` → `main`)

- 병합 전에 시연 흐름을 한 번 돌려 본다.
- 병합 후 태그를 붙인다 (`v0.1` 등).

## 4. API 협업 (명세 우선)

API는 코드보다 명세를 먼저 쓴다. 명세가 확정되면 백엔드는 그대로 구현하고, 프론트엔드는 같은 명세로 타입과 가짜 API(MSW)를 만들어 동시에 개발한다.

### 명세 파일

- 저장소의 `contracts/openapi.yaml` 하나를 기준으로 삼는다(OpenAPI 3). 프론트엔드의 `npm run gen:api`가 이 경로를 읽는다.
- 리뷰어 배정은 지금 CODEOWNERS의 `* @codari-capstone/core` 한 줄이 전부다. core 팀이 3명이라 모든 PR에 나머지 2명이 자동 요청되므로, 결과적으로 명세 PR도 세 명이 다 본다. 경로별 규칙(`/contracts/ @A @B @C`)은 아직 주석이고, 역할이 확정되면 켠다 (7장).
- 핵심 API(인증, 문제, 제출·채점, AI 분석·힌트)는 **M1(2026-10-25)보다 앞서** 확정해야 한다. 이것이 없으면 프론트엔드의 타입 생성과 MSW 작업이 시작되지 않는다. 이슈 #2에서 다룬다. 나머지 API는 해당 기능을 시작하기 전에 같은 방식으로 추가한다.
- 백엔드가 Swagger UI를 띄우더라도 기준은 이 파일이다.

### 명세 변경 절차

1. 변경이 필요한 사람이 `openapi.yaml`만 고친 PR을 올린다 (`docs(contracts): ...`).
2. 그 API를 쓰는 쪽(보통 프론트엔드와 백엔드 둘 다)이 승인해야 병합한다.
3. 병합 후 디스코드 #공지에 바뀐 API를 한 줄로 알린다.
4. 백엔드는 구현을 고치고, 프론트엔드는 `npm run gen:api`로 타입을 다시 만들고 MSW 응답을 고친다.

구현 도중 명세와 다르게 만들어야 할 이유가 생기면, 코드를 먼저 바꾸지 않고 이 절차로 명세부터 고친다.

### 공통 형식

| 항목 | 규칙 | 예시 |
| --- | --- | --- |
| 경로 | `/api`로 시작, 복수형 명사, 소문자·하이픈 | `/api/problems/{id}`, `/api/submissions/{id}/ai-review` |
| JSON 필드 | camelCase | `lineStart`, `evidenceType`, `revealedHintLevel` |
| 고정된 값(enum) | 대문자 스네이크 | `WRONG_ANSWER`, `FACT`, `HIDDEN` |
| 날짜·시간 | ISO 8601, UTC | `2026-10-03T06:15:41Z` |
| 오류 응답 | RFC 9457 (Problem Details) | `{ "type", "title", "status", "detail" }` |
| 목록 조회 | page·size 쿼리, 응답에 전체 개수 포함 | `?page=0&size=20` |

## 5. 코드 컨벤션

표기법과 스타일은 분야별로 담당자가 정하되, 두 분야가 만나는 곳(API JSON, DB)은 공통 규칙을 따른다. 각 분야는 규칙을 포맷터·린터 설정으로 자동화해 리뷰에서 모양을 두고 논쟁하지 않게 한다.

### 공통

| 대상 | 규칙 |
| --- | --- |
| API JSON 필드 | camelCase (4장) |
| DB 테이블·컬럼 | snake\_case, 테이블은 복수형 (ERD와 동일: `problem_versions`, `revealed_hint_level`) |
| 주석 | '무엇을'보다 '왜'를 적음. 한글 허용 |

비밀값과 문제 정답·비공개 테스트를 넣지 않는 규칙은 조직 CONTRIBUTING의 '넣으면 안 되는 것'을 따른다. 조직 문서가 정하지 않은 것 하나 — **운영 비밀값은 AWS SSM Parameter Store에 둔다.** 저장소에는 `.env.example`에 가짜 값만 둔다.

### 프론트엔드 (TypeScript·React)

React는 대문자로 시작하는 이름을 컴포넌트로 취급하므로, 컴포넌트·타입은 PascalCase, 변수·함수는 camelCase로 나눈다.

| 대상 | 표기법 | 예시 |
| --- | --- | --- |
| 컴포넌트와 그 파일 | PascalCase | `HintPanel`, `HintPanel.tsx` |
| 타입·인터페이스 | PascalCase | `SubmissionResult`, `Verdict` |
| 변수·함수 | camelCase | `hintLevel`, `fetchProblem` |
| 커스텀 훅 | use + camelCase | `useSubmissionPolling` |
| 상수 | UPPER\_SNAKE\_CASE | `MAX_HINT_LEVEL` |
| 폴더 | 소문자·하이픈 | `features/ai`, `components/ui` |

포맷은 Prettier, 검사는 ESLint로 자동 적용한다. 자세한 구성은 [frontend-stack.md](./frontend-stack.md)에 있다.

### 백엔드·채점·AI

담당자가 정해 이 절에 추가한다. Java는 보통 클래스 PascalCase, 변수·메서드 camelCase, 패키지 소문자를 따른다.

## 6. 소통·회의·문서

### 디스코드 채널

| 채널 | 용도 |
| --- | --- |
| #공지 | 회의 일정, 결정 사항, API 명세 변경 알림 |
| #일반 | 자유 대화 |
| #리뷰요청 | PR 링크와 리뷰어 멘션, 병합 완료 알림 |
| #프론트 · #백엔드 · #채점-ai | 분야별 질문과 진행 공유 |
| #막힘 | 혼자 해결하기 어려운 문제. 에러 메시지와 시도한 방법을 같이 적음 |
| 음성 채널 | 회의, 페어 디버깅 |

### 소통 규칙

- 디스코드에서 정한 것은 디스코드에만 두지 않는다. 작업은 이슈로, 규칙·명세는 문서로 옮겨 적는다.
- GitHub 알림을 연동하지 않으므로, 리뷰 요청·병합·명세 변경은 본인이 해당 채널에 직접 올린다.
- 하루 이상 막히면 #막힘에 올리고 이슈에 `blocked` 라벨을 붙인다.

### 회의

- 주기와 방식은 상황에 따라 정하고 #공지에 미리 알린다. 계획서의 주간 미팅 시연은 유지한다.
- 회의에서는 보드를 함께 보며 지난 회의 이후 한 일, 다음에 할 일, 막힌 점을 확인한다.
- 회의록은 돌아가며 쓰고 `docs/meetings/YYYY-MM-DD.md`에 남긴다. 항목은 참석자, 결정 사항, 할 일(담당·기한)이다.

### 문서 위치

| 위치 | 담는 내용 |
| --- | --- |
| 조직 `.github` 저장소 | 팀 전체 협업 규칙(CONTRIBUTING), PR·이슈 템플릿. 세 저장소에 공통 적용된다 |
| `README.md` | 프로젝트 소개, 로컬 실행 방법, 폴더 구조 |
| `contracts/` | OpenAPI 명세(`openapi.yaml`). 세 명 공동 리뷰 (4장) |
| `docs/` | 코드와 함께 버전 관리할 문서: 기능명세서, 기술 스택, AI 기능 정의, 이 문서, 회의록. PR로 수정 |
| Wiki | 자주 바뀌는 가이드: 개발환경 설치, 트러블슈팅 기록, 참고 링크 |

저장소에 PR·이슈 템플릿 파일을 따로 두지 않는다. 두면 조직 템플릿을 덮어써서 체크 항목이 줄어든다.

## 7. 남은 결정 사항

- [x] 저장소 구성: 모노레포로 간다 (web·api·judge·infra·contracts·docs를 한 저장소에). `contracts/openapi.yaml`을 상대 경로로 공유한다
- [x] 리뷰 응답 목표 시간: 하루 안에 확인 (조직 CONTRIBUTING에 정해져 있다)
- [x] `develop`·`main` 브랜치 보호: ruleset `develop 보호`·`main 보호 (릴리스)` 두 개가 적용돼 있다. 삭제 금지, 강제 푸시 금지, PR 필수, 승인 1명, 병합 방식 제한(develop은 squash만 / main은 merge commit만). 우회 가능한 계정은 없다
- [ ] **필수 상태 검사(CI)를 ruleset에 걸지.** 지금 두 ruleset에 상태 검사 규칙이 없어서, web CI가 실패한 PR도 승인 1명만 받으면 Squash 병합된다. `develop`이 빌드되지 않는 상태가 될 수 있다. 저장소 admin 권한이 필요하다
- [ ] **리뷰 대화 해결을 필수로 걸지.** `main`은 켜져 있지만 `develop`은 꺼져 있다 (`required_review_thread_resolution`). 같은 권한이 필요하다
- [ ] 백엔드·채점·AI 코드 컨벤션 (5장)
- [ ] 리뷰어 배정 방식: 작성자가 고를지, 순번제로 돌지. CODEOWNERS의 역할별 주석(`/web/ @A` 등)을 켤 시점도 함께 정한다
