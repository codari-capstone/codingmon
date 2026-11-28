// 동시 N명이 문제 보기 → 예제 실행 → 제출 → 채점 결과 → AI 리뷰 요청 → 결과를 한 번씩 한다(#14).
// 코드는 pool.json(사람 코드·참고 정답·만든 오답)에서 고른다. 홀수 번 사용자는 정답 묶음, 짝수 번은 오답 묶음을 돌아가며 쓴다.
// AI 종류는 실제 판정으로 고른다: ACCEPTED면 코드 리뷰, 아니면 오답 분석.
// 실행: README.md의 "실행" 참고
import http from 'k6/http';
import { sleep } from 'k6';
import exec from 'k6/execution';
import { Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE = __ENV.BASE_URL || 'http://api:8080';
const VUS = Number(__ENV.VUS || 10);
const PASSWORD = __ENV.PASSWORD; // 테스트 계정 비밀번호. 저장소에 적지 않는다
if (!PASSWORD) throw new Error('PASSWORD가 필요하다');
const SKIP = (__ENV.SKIP || '').split(',').filter(Boolean).map(Number); // check.js가 판정이 다르다고 한 key
const pool = new SharedArray('pool', () => JSON.parse(open('./pool.json')).filter((e) => !SKIP.includes(e.key)));
const correctPool = pool.filter((e) => e.expect === 'ACCEPTED');
const wrongPool = pool.filter((e) => e.expect !== 'ACCEPTED');
const POLL_SEC = 1; // 웹과 같은 폴링 간격(web/src/app/queryClient.ts)
// AI는 웹처럼 10초 뒤 3초, 60초 뒤 10초 간격으로 늦춘다(web/src/features/ai/analysisQuery.ts)
const aiInterval = (sec) => (sec >= 60 ? POLL_SEC * 10 : sec >= 10 ? POLL_SEC * 3 : POLL_SEC);

const sampleWait = new Trend('wait_sample_run', true);
const judgeWait = new Trend('wait_judge', true);
const analysisWait = new Trend('wait_ai_analysis', true);
const reviewWait = new Trend('wait_ai_code_review', true);
const aiBusy = new Counter('ai_busy');
const aiFailed = new Counter('ai_failed');
const judgeFull = new Counter('judge_queue_full');
const judgeError = new Counter('judge_error');
const unexpected = new Counter('unexpected');

export const options = {
  scenarios: {
    flow: { executor: 'per-vu-iterations', vus: VUS, iterations: 1, maxDuration: __ENV.MAX_DURATION || '90m' },
  },
  setupTimeout: '5m',
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'max'],
};

const json = { 'Content-Type': 'application/json' };
const rand = (a, b) => a + Math.random() * (b - a);

function login(i) {
  const email = `lt${String(i).padStart(3, '0')}@loadtest.local`;
  const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password: PASSWORD }), { headers: json, tags: { name: 'login' } });
  if (res.status !== 200) throw new Error(`${email} 로그인 실패: ${res.status} ${res.body}`);
  return res.json('accessToken');
}

// 로그인은 측정에서 빼려고 시작 전에 한 명씩 한다. 토큰은 30분 유효라 긴 대기 중 401이 오면 poll이 다시 로그인한다.
export function setup() {
  const tokens = [];
  for (let i = 1; i <= VUS; i++) tokens.push(login(i));
  return { tokens };
}

// done(body)가 참이 될 때까지 interval(지난 초) 간격으로 GET(기본 1초). 끝난 응답 본문을 돌려준다.
function poll(url, auth, done, limitSec, interval = () => POLL_SEC) {
  const start = Date.now();
  const end = start + limitSec * 1000;
  while (Date.now() < end) {
    const res = http.get(url, { headers: auth, tags: { name: url.replace(/\/\d+/g, '/{id}') } });
    if (res.status === 401) { auth.Authorization = `Bearer ${login(exec.vu.idInTest)}`; continue; }
    if (res.status === 200 && done(res.json())) return res.json();
    sleep(interval((Date.now() - start) / 1000));
  }
  return null;
}

const finished = (b) => b.status === 'COMPLETED' || b.status === 'JUDGE_ERROR';

export default function (data) {
  const n = exec.vu.idInTest; // 1부터
  const auth = { ...json, Authorization: `Bearer ${data.tokens[n - 1]}` };
  const half = n % 2 === 1 ? correctPool : wrongPool;
  const e = half[Math.floor((n - 1) / 2) % half.length];
  const PROBLEM_ID = e.problemId;
  const tags = { lang: e.language, origin: e.origin };
  const body = JSON.stringify({ problemId: e.problemId, language: e.language, sourceCode: e.sourceCode });

  http.get(`${BASE}/api/problems`, { headers: auth });
  sleep(rand(3, 10));
  http.get(`${BASE}/api/problems/${PROBLEM_ID}`, { headers: auth, tags: { name: '/api/problems/{id}' } });
  sleep(rand(10, 30)); // 코드 작성

  // 예제 실행
  let t = Date.now();
  let res = http.post(`${BASE}/api/sample-runs`, body, { headers: auth });
  if (res.status === 429) { judgeFull.add(1); return; }
  if (res.status !== 202) { unexpected.add(1, { step: 'sample-run', status: String(res.status) }); return; }
  const sample = poll(`${BASE}/api/sample-runs/${res.json('id')}`, auth, finished, 600);
  if (!sample) { unexpected.add(1, { step: 'sample-timeout' }); return; }
  if (sample.status === 'JUDGE_ERROR') { judgeError.add(1, { step: 'sample-run' }); return; }
  sampleWait.add(Date.now() - t, tags);
  sleep(rand(3, 10));

  // 제출
  t = Date.now();
  res = http.post(`${BASE}/api/submissions`, body, { headers: auth });
  if (res.status === 429) { judgeFull.add(1); return; }
  if (res.status !== 202) { unexpected.add(1, { step: 'submit', status: String(res.status) }); return; }
  const id = res.json('id');
  const result = poll(`${BASE}/api/submissions/${id}`, auth, finished, 600);
  if (!result) { unexpected.add(1, { step: 'judge-timeout' }); return; }
  judgeWait.add(Date.now() - t, tags);
  if (result.status === 'JUDGE_ERROR') { judgeError.add(1); return; }
  const correct = result.verdict === 'ACCEPTED';
  if (correct !== (e.expect === 'ACCEPTED')) unexpected.add(1, { step: 'verdict', key: String(e.key) }); // 기록만 하고 계속한다
  sleep(rand(3, 10));

  // AI 리뷰
  const path = `${BASE}/api/submissions/${id}/${correct ? 'code-review' : 'analysis'}`;
  t = Date.now();
  res = http.post(path, null, { headers: auth, tags: { name: correct ? 'code-review' : 'analysis' } });
  if (res.status !== 200 && res.status !== 202) { unexpected.add(1, { step: 'ai', status: String(res.status) }); return; }
  let ai = res.json();
  if (ai.status === 'PENDING') ai = poll(path, auth, (b) => b.status !== 'PENDING', 3600, aiInterval);
  if (!ai) { unexpected.add(1, { step: 'ai-timeout' }); return; }
  if (ai.status === 'FAILED') { (ai.failureReason === 'BUSY' ? aiBusy : aiFailed).add(1, { reason: String(ai.failureReason) }); return; }
  (correct ? reviewWait : analysisWait).add(Date.now() - t, tags);
}
