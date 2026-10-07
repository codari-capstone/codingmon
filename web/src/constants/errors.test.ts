import { describe, expect, it } from 'vitest'

import { toUserMessage } from './errors'

describe('toUserMessage', () => {
  it('아는 type이면 그 문구를 쓴다', () => {
    const msg = toUserMessage({
      type: '/problems/judge-unavailable',
      title: 'Judge unavailable',
      status: 503,
      detail: 'Judge0 queue is not reachable',
    })

    expect(msg.title).toBe('지금은 제출할 수 없습니다')
    expect(msg.description).toContain('시도 횟수에 넣지 않습니다')
    expect(msg.retryable).toBe(true)
  })

  it('모르는 type이면 status별 기본 문구를 쓴다', () => {
    expect(toUserMessage({ type: '/problems/unknown-thing', status: 404 }).title).toBe(
      '찾을 수 없습니다',
    )
    expect(toUserMessage({ status: 401 }).title).toBe('로그인이 필요합니다')
    expect(toUserMessage({ status: 403 }).title).toBe('권한이 없습니다')
    expect(toUserMessage({ status: 429 }).retryable).toBe(true)
  })

  it('5xx는 다시 시도할 수 있다고 본다', () => {
    expect(toUserMessage({ status: 500 }).retryable).toBe(true)
    expect(toUserMessage({ status: 502 }).retryable).toBe(true)
  })

  it('4xx는 다시 시도해도 같다고 본다', () => {
    expect(toUserMessage({ status: 400 }).retryable).toBe(false)
    expect(toUserMessage({ status: 404 }).retryable).toBe(false)
  })

  // 네트워크가 끊기면 JSON이 아니라 Error나 undefined가 올라온다
  it('RFC 9457 형식이 아니어도 문구를 돌려준다', () => {
    expect(toUserMessage(undefined).title).toBe('문제가 발생했습니다')
    expect(toUserMessage(new Error('Failed to fetch')).title).toBe('문제가 발생했습니다')
    expect(toUserMessage('그냥 문자열').title).toBe('문제가 발생했습니다')
    expect(toUserMessage(undefined).retryable).toBe(true)
  })

  // 서버 detail을 그대로 보여 주면 사용자가 읽을 수 없는 영어 기술 문장이 노출된다
  it('서버 detail을 사용자 문구로 쓰지 않는다', () => {
    const msg = toUserMessage({ status: 500, detail: 'NullPointerException at line 42' })
    expect(msg.description).not.toContain('NullPointerException')
  })
})
