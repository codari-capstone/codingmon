#!/usr/bin/env bash
# 빌드 결과(dist/)를 운영 이미지와 같은 nginx로 띄워 nginx.conf의 응답을 본다.
# E2E는 vite preview로 돌아 nginx.conf를 거치지 않으므로 이 검사가 따로 있다.
# web CI가 빌드 뒤에 돌리고, 로컬에서도 `npm run build && bash scripts/check-nginx.sh`로 돌린다(Docker 필요).
set -euo pipefail
cd "$(dirname "$0")/.."

image=$(sed -n 's/^FROM \(nginx:[^ ]*\).*/\1/p' Dockerfile)
port=${NGINX_CHECK_PORT:-18080}
name=codingmon-nginx-check-$$

# api 이름이 풀려야 nginx가 뜬다. 127.0.0.1에는 API가 없어 /api/는 502가 된다
docker run -d --name "$name" --add-host api:127.0.0.1 -p "127.0.0.1:$port:80" \
  -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/dist:/usr/share/nginx/html:ro" \
  "$image" >/dev/null
trap 'docker rm -f "$name" >/dev/null' EXIT

for _ in $(seq 50); do
  curl -fs -o /dev/null "http://127.0.0.1:$port/" && break
  sleep 0.2
done

failed=0
# check <경로> <상태 코드> <Content-Type 앞부분> [Cache-Control]
check() {
  local path=$1 want="$2 $3" want_cache=${4-}
  local headers got cache
  headers=$(curl -s -o /dev/null -D - "http://127.0.0.1:$port$path" | tr -d '\r')
  got=$(awk 'NR == 1 { s = $2 } tolower($1) == "content-type:" { t = $2 } END { print s, t }' <<<"$headers")
  cache=$(awk 'tolower($1) == "cache-control:" { $1 = ""; sub(/^ /, ""); print }' <<<"$headers")
  if [[ "$got" != "$want"* || (-n "$want_cache" && "$cache" != "$want_cache") ]]; then
    echo "FAIL $path: 기대 '$want' ${want_cache:+(Cache-Control: $want_cache)}, 받음 '$got' (Cache-Control: $cache)"
    failed=1
  else
    echo "ok   $path: $got${cache:+ (Cache-Control: $cache)}"
  fi
}

# 있는 정적 파일은 그 파일로
check /robots.txt 200 text/plain no-cache
check /sitemap.xml 200 text/xml no-cache
check /site.webmanifest 200 application/manifest+json no-cache
check /favicon.ico 200 image/x-icon no-cache
# 없는 정적 파일은 index.html이 아니라 404
check /llms.txt 404 text/html
check /icon.svg 404 text/html
check /nope.webmanifest 404 text/html
# 화면 경로는 index.html(클라이언트 라우터가 처리)
check /problems 200 text/html no-cache
check /no-such-page 200 text/html no-cache
# 해시가 붙은 번들은 오래 캐시
asset=$(cd dist && ls assets/*.js | head -n 1)
check "/$asset" 200 application/javascript "public, max-age=31536000, immutable"
check /assets/nope.js 404 text/html
# 확장자가 있어도 /api/는 정적 파일 규칙을 거치지 않고 API로 넘어간다(여기서는 API가 없어 502)
check /api/x.json 502 text/html

exit "$failed"
