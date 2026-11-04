/**
 * 한 문제의 제출 목록 주소 (HIST-02). 링크가 쓴다.
 *
 * 라우터는 같은 모양을 문자열(`submissions/problems/:problemId`, app/router.tsx)로 적는다 —
 * 패턴과 채워진 주소는 한 함수로 만들 수 없다. 주소를 바꿀 때는 둘을 함께 고친다.
 * 어긋나면 기록 화면의 문제 링크가 없는 경로로 간다(historyRoutes.test.tsx가 잡는다).
 */
export function problemSubmissionsPath(problemId: number): string {
  return `/submissions/problems/${problemId}`
}
