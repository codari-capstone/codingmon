import { useState } from 'react'

/**
 * 애니메이션 줄이기 (UX-08).
 *
 * 저장한 선택이 없으면 기기의 '동작 줄이기'를 따른다. 고르면 `<html data-motion>`에 적고,
 * index.css의 `motion-reduce` 변형이 이 값과 기기 설정을 함께 본다 — 그래서 컴포넌트마다
 * 붙어 있는 `motion-reduce:` 클래스가 고치지 않아도 이 선택을 따른다.
 */
export type MotionPreference = 'reduce' | 'full'

export const MOTION_STORAGE_KEY = 'codari-motion'
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'

export function readStoredMotion(): MotionPreference | null {
  try {
    const raw = localStorage.getItem(MOTION_STORAGE_KEY)
    return raw === 'reduce' || raw === 'full' ? raw : null
  } catch {
    return null // 사생활 보호 모드에서는 접근 자체가 던진다
  }
}

export function applyMotion(preference: MotionPreference | null): void {
  if (preference) document.documentElement.dataset.motion = preference
  else delete document.documentElement.dataset.motion
}

/** 화면 설정의 스위치. 켜져 보이는지는 저장한 선택, 없으면 기기 설정이다. */
export function useReduceMotion(): [boolean, (reduce: boolean) => void] {
  const [stored, setStored] = useState(readStoredMotion)
  // shortcut: 기기 설정은 화면을 열 때 한 번 읽는다. 열어 둔 채 기기 설정을 바꾸면 스위치만 늦게 따라온다
  const [deviceReduces] = useState(() => window.matchMedia(REDUCE_QUERY).matches)

  const set = (reduce: boolean) => {
    const next: MotionPreference = reduce ? 'reduce' : 'full'
    try {
      localStorage.setItem(MOTION_STORAGE_KEY, next)
    } catch {
      // 저장이 막혔으면 이번 방문에만 적용된다
    }
    applyMotion(next)
    setStored(next)
  }
  return [stored ? stored === 'reduce' : deviceReduces, set]
}
