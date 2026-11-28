// 본 측정 전에 pool.json의 코드를 lt001로 하나씩 제출해 예상 판정과 맞는지 본다. AI는 부르지 않는다.
// 실행: README.md의 "실행" 참고
// 마지막 줄의 SKIP=... 값을 loadtest.js 실행 때 -e SKIP=...로 넘긴다.
import http from 'k6/http';
import { sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://api:8080';
const json = { 'Content-Type': 'application/json' };
const pool = JSON.parse(open('./pool.json'));
const PASSWORD = __ENV.PASSWORD; // 테스트 계정 비밀번호. 저장소에 적지 않는다
if (!PASSWORD) throw new Error('PASSWORD가 필요하다');

export const options = { scenarios: { check: { executor: 'shared-iterations', vus: 1, iterations: 1, maxDuration: '30m' } } };

export default function () {
  const login = http.post(`${BASE}/api/auth/login`,
    JSON.stringify({ email: 'lt001@loadtest.local', password: PASSWORD }), { headers: json });
  const auth = { ...json, Authorization: `Bearer ${login.json('accessToken')}` };
  const skip = [];
  for (const e of pool) {
    const res = http.post(`${BASE}/api/submissions`,
      JSON.stringify({ problemId: e.problemId, language: e.language, sourceCode: e.sourceCode }), { headers: auth });
    let r = null;
    if (res.status === 202) {
      for (let i = 0; i < 120; i++) {
        r = http.get(`${BASE}/api/submissions/${res.json('id')}`, { headers: auth }).json();
        if (r.status === 'COMPLETED' || r.status === 'JUDGE_ERROR') break;
        sleep(1);
      }
    }
    const verdict = r ? `${r.status}/${r.verdict}` : `HTTP ${res.status}`;
    const ok = r && r.status === 'COMPLETED' && (r.verdict === 'ACCEPTED') === (e.expect === 'ACCEPTED');
    if (!ok) skip.push(e.key);
    console.log(`${ok ? 'OK  ' : 'DIFF'} key=${e.key} p=${e.problemId} ${e.language} ${e.origin} expect=${e.expect} got=${verdict} (${e.note})`);
  }
  console.log(`SKIP=${skip.join(',')}`);
}
