/** 한 문제의 제출 목록 주소 (HIST-02). 라우터와 링크가 같은 주소를 쓴다. */
export function problemSubmissionsPath(problemId: number): string {
  return `/submissions/problems/${problemId}`
}
