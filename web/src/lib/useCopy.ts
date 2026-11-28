import { useEffect, useRef, useState } from 'react'

/** 복사됨 표시를 유지하는 시간. */
export const COPIED_MS = 1500

/**
 * 클립보드 복사와 잠깐 보이는 '복사됨' 상태. 예제 복사(Samples)와 CodeBlock이 같은 동작을 쓴다.
 *
 * `navigator.clipboard`는 https와 localhost에서만 있다. 없거나 권한이 거절되면 아무
 * 표시도 하지 않는다 — "복사됨"이라고 거짓말하는 쪽이 더 나쁘다.
 */
export function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // 복사 직후 버튼이 사라지면(다른 예제로 넘어감) 타이머가 사라진 state를 건드린다
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), COPIED_MS)
  }

  return { copied, copy }
}
