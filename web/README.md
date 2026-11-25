# web

프론트엔드. React 19 + Vite + TypeScript SPA이며, 빌드한 정적 파일을 Nginx로 배포하고
Spring Boot API와 HTTP(JSON)로 통신한다. 자세한 선정 근거는 [docs/frontend-stack.md](../docs/frontend-stack.md)에 있다.

## 시작하기

Node.js 24 이상이 필요하다.

```bash
npm install
cp .env.example .env   # 필요한 값을 채운다
npm run dev            # http://localhost:5173
```

백엔드가 아직 없으면 MSW 가짜 응답으로 개발한다.

```bash
npm run dev:mock
```

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버. `/api` 요청은 localhost:8080으로 넘어간다 |
| `npm run dev:mock` | MSW 가짜 응답으로 개발 서버 실행 |
| `npm run gen:api` | `contracts/openapi.yaml`에서 `src/api/schema.d.ts` 생성 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | ESLint 검사 |
| `npm run format` | Prettier로 코드 모양 통일 |
| `npm run test` | Vitest 단위·컴포넌트 테스트 |
| `npm run e2e` | Playwright E2E (`npx playwright install chromium` 필요) |
| `npm run build` | 배포용 정적 파일을 `dist/`에 생성 |

## 폴더

| 폴더 | 내용 |
| --- | --- |
| `src/app/` | 라우터, QueryClient, 레이아웃, 권한 검사 (COM) |
| `src/api/` | `schema.d.ts`(자동 생성), `client.ts`, 쿼리 훅 |
| `src/features/` | 화면별 기능. 기능명세서 ID와 폴더가 1:1로 맞는다 |
| `src/components/` | 직접 만든 화면 조각. 받을지 만들지의 기준은 [docs/frontend-stack.md](../docs/frontend-stack.md)의 '부품을 받을지, 직접 만들지' |
| `src/components/ui/` | 디자인 시스템 부품. `shadcn add`로 받아 꾸민 것과 직접 만든 것이 함께 있다 — 같은 이름을 `shadcn add`로 받으면 덮어쓴다 ([docs/frontend-stack.md](../docs/frontend-stack.md)) |
| `src/constants/` | 판정별 쉬운 설명 (RES-03·RES-04) |
| `src/mocks/` | MSW 가짜 응답 |
| `e2e/` | Playwright 테스트 |

## 알아 둘 것

- `npm run gen:api`는 `contracts/openapi.yaml`이 있어야 동작한다. 1주차 M1에서 명세를 확정한다.
- `shadcn add <부품>` 뒤에는 `npm run format`을 돌린다. 생성 코드가 쌍따옴표를 쓴다.
- `VITE_` 접두사가 붙은 환경 변수는 브라우저에서 누구나 볼 수 있다. 비밀값은 넣지 않는다.

## 검색 노출

| 파일 | 역할 |
| --- | --- |
| `index.html` `<head>` | 공통 제목·설명·OG·아이콘·구조화 데이터, 네이버 서치어드바이저 소유 확인 메타. 화면별 제목·canonical·noindex는 `src/app/PageHead.tsx`가 단다 |
| `public/robots.txt` | 사이트맵 주소. 운영에서는 Cloudflare가 관리형 규칙(학습용 AI 크롤러 차단, Content-Signal)을 이 파일 앞에 붙인다 |
| `public/sitemap.xml` | 검색에 내보낼 공개 화면의 정식 주소 |
| `nginx.conf` | `.txt`·`.xml`·아이콘·manifest 같은 정적 파일은 없으면 404로 답한다. `index.html`로 보내는 것은 화면 경로뿐이다 |

- 공개 화면을 새로 만들면 `sitemap.xml`에 canonical과 같은 꼴(소문자, 끝 슬래시 없음)로 넣는다. `e2e/seo.spec.ts`가 사이트맵 주소마다 canonical이 같고 noindex가 없는지 본다.
- 로그인이 필요한 화면은 `robots.txt`로 막지 않는다. 막으면 크롤러가 화면을 읽지 못해 로그인 화면으로 돌려보내는 것과 noindex를 보지 못하고 주소만 색인할 수 있다.
- 학습용 AI 크롤러는 Cloudflare 관리형 robots.txt로 막는다. 이 설정은 끄지 않고, 우리 `robots.txt`에서도 풀지 않는다.
- 구글 서치콘솔은 도메인 속성으로, Cloudflare DNS의 `google-site-verification` TXT 레코드로 소유를 확인한다. 네이버 서치어드바이저는 `index.html`의 `naver-site-verification` 메타로 확인한다. 레코드나 메타를 지우면 확인이 풀린다. 두 곳 모두 `https://codingmon.tech/sitemap.xml`을 제출했다.
