import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  claimUnansweredCode,
  clearSavedCode,
  forgetJudgedCode,
  forgetProblemDrafts,
  forgetSubmittedCode,
  keepUntilJudged,
  markHeldSubmission,
  readDraftCode,
  readMissedRetryCode,
  readSavedCode,
  savedCodeKey,
  settleSavedCodeOnLoad,
  startSavedCodeSync,
  storeSavedCode,
} from './savedCode'

const judged = (id: number) => ({
  id,
  status: 'COMPLETED' as const,
  problemId: 1,
  language: 'PYTHON' as const,
  sourceCode: 'print(1)',
})

describe('savedCode', () => {
  afterEach(() => {
    // 응답 대기 표시는 메모리에 있어 저장소를 비워도 남는다. 새 문서처럼 비운다
    settleSavedCodeOnLoad(undefined, '/')
    sessionStorage.clear()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('사용자·문제·언어가 모두 키에 들어간다', () => {
    expect(savedCodeKey(5, 7, 'PYTHON')).toBe('solve:5:7:PYTHON')
    // 사용자가 빠지면 공용 PC에서 다른 계정의 코드가 열린다.
    expect(savedCodeKey(6, 7, 'PYTHON')).not.toBe(savedCodeKey(5, 7, 'PYTHON'))
    // 언어가 빠지면 Python으로 쓰던 코드가 C++ 자리에 열린다.
    expect(savedCodeKey(5, 7, 'CPP')).not.toBe(savedCodeKey(5, 7, 'PYTHON'))
  })

  it('쓴 코드를 그대로 읽는다', () => {
    storeSavedCode(5, 1, 'PYTHON', 'print(1)')

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('print(1)')
    expect(readSavedCode(5, 1, 'CPP')).toBeNull()
    expect(readSavedCode(5, 2, 'PYTHON')).toBeNull()
  })

  /**
   * 공용 PC에서 A가 쓰고 로그아웃하지 않은 채 B가 로그인하는 경우다. 세션이 조용히
   * 끊기면 로그아웃을 거치지도 않으니, 지우는 것만으로는 막을 수 없고 키가 갈려야 한다.
   */
  it('다른 사용자의 코드를 읽지도 덮어쓰지도 않는다', () => {
    storeSavedCode(5, 1, 'PYTHON', 'A가 쓴 코드')

    expect(readSavedCode(6, 1, 'PYTHON')).toBeNull()

    storeSavedCode(6, 1, 'PYTHON', 'B가 쓴 코드')
    expect(readSavedCode(5, 1, 'PYTHON')).toBe('A가 쓴 코드')
  })

  it('사용자를 모르면 읽지도 쓰지도 않는다', () => {
    storeSavedCode(undefined, 1, 'PYTHON', 'print(1)')

    expect(sessionStorage.length).toBe(0)
    expect(readSavedCode(undefined, 1, 'PYTHON')).toBeNull()
  })

  /** 로그아웃은 "이 사람의 데이터를 전부 잊는다"는 뜻이다 (useLogout 주석). */
  it('지우면 모든 사용자의 저장이 사라지고 다른 키는 남는다', () => {
    storeSavedCode(5, 1, 'PYTHON', 'A')
    storeSavedCode(6, 2, 'CPP', 'B')
    localStorage.setItem('codari-theme', 'dark')

    clearSavedCode()

    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
    expect(readSavedCode(6, 2, 'CPP')).toBeNull()
    // 테마는 사람이 아니라 이 기기의 보기 설정이다.
    expect(localStorage.getItem('codari-theme')).toBe('dark')
  })

  it('제출한 코드의 저장본만 지운다', () => {
    storeSavedCode(5, 1, 'PYTHON', 'print(1)')
    storeSavedCode(5, 1, 'CPP', '// 쓰던 C++')

    forgetSubmittedCode(5, 1, 'PYTHON', 'print(1)')

    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
    expect(readSavedCode(5, 1, 'CPP')).toBe('// 쓰던 C++')
  })

  it('화면을 떠나면 그 사용자의 그 문제 코드만 모든 언어에서 지운다', () => {
    storeSavedCode(5, 1, 'PYTHON', 'A')
    storeSavedCode(5, 1, 'CPP', 'B')
    storeSavedCode(5, 11, 'PYTHON', '다른 문제')
    storeSavedCode(6, 1, 'PYTHON', '다른 사용자')

    forgetProblemDrafts(5, 1)

    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
    expect(readSavedCode(5, 1, 'CPP')).toBeNull()
    expect(readSavedCode(5, 11, 'PYTHON')).toBe('다른 문제')
    expect(readSavedCode(6, 1, 'PYTHON')).toBe('다른 사용자')
  })

  it('로그아웃은 예전 버전이 localStorage에 남긴 코드도 지운다', () => {
    localStorage.setItem('solve:5:1:PYTHON', '예전 코드')

    clearSavedCode()

    expect(localStorage.getItem('solve:5:1:PYTHON')).toBeNull()
  })

  it('판정 대기 코드는 작성 중 코드를 지워도 남고, 판정이 나면 지워진다', () => {
    keepUntilJudged(5, 1, 'PYTHON', 'print(1)')
    markHeldSubmission(5, 1, 'PYTHON', 'print(1)', 7)

    forgetProblemDrafts(5, 1)
    expect(readSavedCode(5, 1, 'PYTHON')).toBe('print(1)')

    forgetJudgedCode(5, judged(7))
    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
  })

  it('코드가 같아도 다른 제출의 판정으로는 판정 대기 코드를 지우지 않는다', () => {
    keepUntilJudged(5, 1, 'PYTHON', 'print(1)')
    markHeldSubmission(5, 1, 'PYTHON', 'print(1)', 8)

    forgetJudgedCode(5, judged(7))

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('print(1)')
  })

  it('접수 전 판정 대기 코드는 어떤 판정으로도 지우지 않는다', () => {
    keepUntilJudged(5, 1, 'PYTHON', 'print(1)')

    forgetJudgedCode(5, judged(7))

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('print(1)')
  })

  it('그사이 다른 코드를 보냈으면 앞 제출의 번호를 적지 않는다', () => {
    keepUntilJudged(5, 1, 'PYTHON', '앞 코드')
    keepUntilJudged(5, 1, 'PYTHON', '새 코드')

    markHeldSubmission(5, 1, 'PYTHON', '앞 코드', 7)
    forgetJudgedCode(5, { ...judged(7), sourceCode: '새 코드' })

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('새 코드')
  })

  it('접수되면 같은 코드의 작성 중 사본만 없애고, 더 고친 코드는 남긴다', () => {
    storeSavedCode(5, 1, 'PYTHON', 'print(1)')
    keepUntilJudged(5, 1, 'PYTHON', 'print(1)')
    markHeldSubmission(5, 1, 'PYTHON', 'print(1)', 7)
    expect(readDraftCode(5, 1, 'PYTHON')).toBeNull()
    expect(readSavedCode(5, 1, 'PYTHON')).toBe('print(1)')

    storeSavedCode(5, 2, 'PYTHON', '더 고친 코드')
    keepUntilJudged(5, 2, 'PYTHON', 'print(2)')
    markHeldSubmission(5, 2, 'PYTHON', 'print(2)', 8)
    expect(readDraftCode(5, 2, 'PYTHON')).toBe('더 고친 코드')
  })

  it('작성 중 코드만 읽을 때는 판정 대기 코드를 돌려주지 않는다', () => {
    keepUntilJudged(5, 1, 'PYTHON', 'print(1)')
    expect(readDraftCode(5, 1, 'PYTHON')).toBeNull()

    storeSavedCode(5, 1, 'PYTHON', '작성 중')
    expect(readDraftCode(5, 1, 'PYTHON')).toBe('작성 중')
  })

  it('접수가 실패하면 판정 대기 자리를 되돌리고 그 코드를 작성 중 코드로 남긴다', () => {
    keepUntilJudged(5, 1, 'PYTHON', '이전 제출')
    markHeldSubmission(5, 1, 'PYTHON', '이전 제출', 7)
    const release = keepUntilJudged(5, 1, 'PYTHON', '실패한 제출')

    release()

    expect(readDraftCode(5, 1, 'PYTHON')).toBe('실패한 제출')
    forgetProblemDrafts(5, 1)
    expect(readSavedCode(5, 1, 'PYTHON')).toBe('이전 제출')
  })

  it('접수 실패가 더 고친 코드를 덮지 않고, 로그아웃 뒤에는 되살리지 않는다', () => {
    storeSavedCode(5, 1, 'PYTHON', '더 고친 코드')
    keepUntilJudged(5, 1, 'PYTHON', '보낸 코드')()
    expect(readDraftCode(5, 1, 'PYTHON')).toBe('더 고친 코드')

    const release = keepUntilJudged(5, 2, 'PYTHON', '보낸 코드')
    clearSavedCode()
    release()
    expect(readSavedCode(5, 2, 'PYTHON')).toBeNull()
  })

  it('떠난 뒤 지우기 전에 실패가 와도 코드를 남긴다', () => {
    storeSavedCode(5, 1, 'PYTHON', '응답 대기')
    const release = keepUntilJudged(5, 1, 'PYTHON', '응답 대기')

    release(true)
    forgetProblemDrafts(5, 1)

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('응답 대기')
  })

  it('떠난 뒤 실패한 코드는 주소창 이동이 이어져도 남고, 열어 본 뒤 떠나면 지워진다', () => {
    const release = keepUntilJudged(5, 1, 'PYTHON', '실패한 코드')
    release(true)

    settleSavedCodeOnLoad('navigate', '/problems/1')
    expect(readSavedCode(5, 1, 'PYTHON')).toBe('실패한 코드')

    claimUnansweredCode(5, 1, 'PYTHON')
    expect(readDraftCode(5, 1, 'PYTHON')).toBe('실패한 코드')
    forgetProblemDrafts(5, 1)
    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
  })

  it('열어 보지 않은 응답 못 받은 코드는 화면을 떠나도 지우지 않는다', () => {
    keepUntilJudged(5, 1, 'PYTHON', '못 본 코드')
    settleSavedCodeOnLoad('reload', '/problems/1')

    claimUnansweredCode(5, 1, 'CPP')
    forgetProblemDrafts(5, 1)

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('못 본 코드')
  })

  it('열어 본 응답 못 받은 코드는 다음 주소창 이동에 지워진다', () => {
    keepUntilJudged(5, 1, 'PYTHON', '본 코드')
    settleSavedCodeOnLoad('reload', '/problems/1')

    claimUnansweredCode(5, 1, 'PYTHON')
    settleSavedCodeOnLoad('navigate', '/problems')

    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
  })

  it('응답을 기다리는 코드는 열어도 옮기지 않는다', () => {
    keepUntilJudged(5, 1, 'PYTHON', '보내는 중')

    claimUnansweredCode(5, 1, 'PYTHON')

    expect(readDraftCode(5, 1, 'PYTHON')).toBeNull()
    expect(readSavedCode(5, 1, 'PYTHON')).toBe('보내는 중')
  })

  it('같은 언어로 두 번 보내 뒤 요청이 먼저 실패해도 앞 요청의 코드를 지키고 번호를 적는다', () => {
    keepUntilJudged(5, 1, 'PYTHON', 'print(1)')
    const second = keepUntilJudged(5, 1, 'PYTHON', '뒤 코드')

    second()
    forgetProblemDrafts(5, 1)
    claimUnansweredCode(5, 1, 'PYTHON')
    expect(readSavedCode(5, 1, 'PYTHON')).toBe('print(1)')
    expect(readDraftCode(5, 1, 'PYTHON')).toBeNull()

    markHeldSubmission(5, 1, 'PYTHON', 'print(1)', 7)
    forgetJudgedCode(5, judged(7))
    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
  })

  it('떠난 뒤 실패한 코드를 열어 치우면 그 앞의 판정 대기 코드가 돌아온다', () => {
    keepUntilJudged(5, 1, 'PYTHON', '앞 제출')
    markHeldSubmission(5, 1, 'PYTHON', '앞 제출', 7)
    keepUntilJudged(5, 1, 'PYTHON', '실패한 코드')(true)

    claimUnansweredCode(5, 1, 'PYTHON')
    forgetProblemDrafts(5, 1)

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('앞 제출')
  })

  it('문서가 내려간 뒤 끝난 요청은 복원된 문서에서 대기 중으로 남지 않는다', () => {
    startSavedCodeSync()
    const release = keepUntilJudged(5, 1, 'PYTHON', 'print(1)')

    window.dispatchEvent(new Event('pagehide'))
    release()
    window.dispatchEvent(new Event('pageshow'))
    forgetJudgedCode(5, judged(7))

    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
  })

  it('다시 풀기 조회가 실패하면 그 제출의 판정 대기 코드만 연다', () => {
    keepUntilJudged(5, 1, 'PYTHON', '고른 제출')
    markHeldSubmission(5, 1, 'PYTHON', '고른 제출', 7)

    expect(readMissedRetryCode(5, 1, 'PYTHON', 7)).toBe('고른 제출')
    expect(readMissedRetryCode(5, 1, 'PYTHON', 8)).toBeNull()

    storeSavedCode(5, 1, 'PYTHON', '작성 중')
    expect(readMissedRetryCode(5, 1, 'PYTHON', 8)).toBe('작성 중')
  })

  it('접수 응답을 기다리는 코드는 화면을 떠나 실패해도 남고 다른 언어는 지운다', () => {
    storeSavedCode(5, 1, 'PYTHON', '응답 대기')
    storeSavedCode(5, 1, 'CPP', '다른 언어')
    const release = keepUntilJudged(5, 1, 'PYTHON', '응답 대기')

    forgetProblemDrafts(5, 1)
    release(true)

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('응답 대기')
    expect(readSavedCode(5, 1, 'CPP')).toBeNull()
  })

  it('응답 전에 새로고침한 코드는 열어 본 뒤 화면을 떠나면 지워진다', () => {
    keepUntilJudged(5, 1, 'PYTHON', '응답 못 받음')

    settleSavedCodeOnLoad('reload', '/problems/1')
    expect(readSavedCode(5, 1, 'PYTHON')).toBe('응답 못 받음')

    claimUnansweredCode(5, 1, 'PYTHON')
    forgetProblemDrafts(5, 1)
    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
  })

  it('응답 전에 주소창 이동이 두 번 이어져도 코드가 남는다', () => {
    keepUntilJudged(5, 1, 'PYTHON', '응답 못 받음')

    settleSavedCodeOnLoad('navigate', '/problems')
    settleSavedCodeOnLoad('navigate', '/problems/1')

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('응답 못 받음')
  })

  it('문서가 내려가며 끊긴 요청은 접수 실패로 치지 않아 다음 문서에도 코드가 남는다', () => {
    startSavedCodeSync()
    const release = keepUntilJudged(5, 1, 'PYTHON', '응답 못 받음')

    window.dispatchEvent(new Event('pagehide'))
    release()
    window.dispatchEvent(new Event('pageshow'))
    settleSavedCodeOnLoad('navigate', '/problems')

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('응답 못 받음')
  })

  it('응답을 못 받은 코드는 같은 코드의 판정이 나면 지워진다', () => {
    keepUntilJudged(5, 1, 'PYTHON', 'print(1)')
    settleSavedCodeOnLoad('reload', '/problems/1')

    forgetJudgedCode(5, judged(7))

    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
  })

  it('화면을 떠나도 번호 있는 판정 대기 코드는 남긴다', () => {
    keepUntilJudged(5, 2, 'PYTHON', '접수된 코드')
    markHeldSubmission(5, 2, 'PYTHON', '접수된 코드', 7)
    settleSavedCodeOnLoad('reload', '/problems/2')

    forgetProblemDrafts(5, 2)

    expect(readSavedCode(5, 2, 'PYTHON')).toBe('접수된 코드')
  })

  it('주소창 이동으로 문서를 새로 열면 작성 중 코드만 지운다', () => {
    storeSavedCode(5, 1, 'PYTHON', '작성 중')
    keepUntilJudged(5, 2, 'PYTHON', '판정 대기')
    markHeldSubmission(5, 2, 'PYTHON', '판정 대기', 7)

    settleSavedCodeOnLoad('navigate', '/problems')

    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
    expect(readSavedCode(5, 2, 'PYTHON')).toBe('판정 대기')
  })

  it('새로고침·뒤로 가기·GitHub 로그인 복귀는 작성 중 코드를 남긴다', () => {
    storeSavedCode(5, 1, 'PYTHON', '작성 중')

    settleSavedCodeOnLoad('reload', '/problems/1')
    settleSavedCodeOnLoad('back_forward', '/problems/1')
    settleSavedCodeOnLoad('navigate', '/login/github')

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('작성 중')
  })

  it('예전 localStorage 저장본은 새로고침일 때만 옮기고 어느 경우든 지운다', () => {
    localStorage.setItem('solve:5:1:PYTHON', '예전 코드')
    settleSavedCodeOnLoad('reload', '/problems/1')
    expect(readSavedCode(5, 1, 'PYTHON')).toBe('예전 코드')
    expect(localStorage.getItem('solve:5:1:PYTHON')).toBeNull()

    sessionStorage.clear()
    localStorage.setItem('solve:5:1:PYTHON', '예전 코드')
    settleSavedCodeOnLoad('navigate', '/problems')
    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
    expect(localStorage.getItem('solve:5:1:PYTHON')).toBeNull()
  })

  it('제출 뒤에 더 고친 저장본은 남긴다', () => {
    storeSavedCode(5, 1, 'PYTHON', 'print(2)')

    forgetSubmittedCode(5, 1, 'PYTHON', 'print(1)')

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('print(2)')
  })

  /**
   * 사생활 보호 모드나 사이트 데이터가 막힌 브라우저에서는 접근 자체가 던진다.
   * 저장이 없던 것으로 보고 넘어가야 한다 — 화면이 터지면 문제를 못 푼다.
   */
  it('저장소가 던져도 읽기는 null, 쓰기와 지우기는 조용히 넘어간다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
    expect(() => storeSavedCode(5, 1, 'PYTHON', 'print(1)')).not.toThrow()
    expect(() => clearSavedCode()).not.toThrow()
  })
})
