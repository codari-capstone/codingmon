# syntax=docker/dockerfile:1
# 웹 이미지 (infra/compose.yaml). 빌드한 정적 파일을 nginx가 내보내고 /api/는 API 서버로 넘긴다.
# 빌드 결과(JS·CSS)는 아키텍처와 무관해서 빌드 단계는 빌드하는 기계(BUILDPLATFORM)에서 돈다.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# 포트원 상점 ID·채널 키(PAY-01). Vite가 빌드할 때 번들에 넣는 공개 값이라 .env 대신 빌드 인자로 받는다(.dockerignore가 .env를 뺀다).
# 비워 두면 결제 버튼이 '결제 설정이 아직 준비되지 않았어요'를 띄운다
ARG VITE_PORTONE_STORE_ID=
ARG VITE_PORTONE_CHANNEL_KEY=
RUN VITE_PORTONE_STORE_ID=$VITE_PORTONE_STORE_ID VITE_PORTONE_CHANNEL_KEY=$VITE_PORTONE_CHANNEL_KEY npm run build

# 패치 버전까지 적는다. 1.29-alpine처럼 브랜치 태그만 적으면 그 브랜치 지원이 끝난 뒤
# 보안 수정이 나와도 이미지가 그대로다(1.29는 2026-04 이후 갱신 없음, CVE-2026-123007 등 미수정)
FROM nginx:1.30.7-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
