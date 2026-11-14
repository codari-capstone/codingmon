import { useState, useSyncExternalStore } from 'react'

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

let current: MotionPreference | null = null
const listeners = new Set<() => void>()

/** 저장한 선택. null이면 기기 설정을 따른다. */
function set(preference: MotionPreference | null) {
  current = preference
  if (preference) document.documentElement.dataset.motion = preference
  else delete document.documentElement.dataset.motion
  listeners.forEach((listener) => listener())
}

function onStorage(event: StorageEvent) {
  // key가 null이면 다른 탭이 저장소를 통째로 비운 것이다
  if (event.key === null || event.key === MOTION_STORAGE_KEY) set(readStoredMotion())
}

/**
 * 앱이 시작될 때 한 번 부른다(main.tsx). 첫 화면부터 저장한 선택을 따르고, 다른 탭에서 바꾸면
 * 화면 설정을 열지 않은 탭에도 바로 적용된다 — 그래서 구독이 아니라 앱 수명 동안 듣는다.
 */
export function startMotionSync(): void {
  set(readStoredMotion())
  window.addEventListener('storage', onStorage)
}

function choose(preference: MotionPreference | null) {
  try {
    if (preference) localStorage.setItem(MOTION_STORAGE_KEY, preference)
    else localStorage.removeItem(MOTION_STORAGE_KEY)
  } catch {
    // 저장이 막혔으면 이번 방문에만 적용된다
  }
  set(preference)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * 화면 설정의 스위치. 켜져 보이는지는 저장한 선택, 없으면 기기 설정이다.
 * `followDevice`는 저장한 선택을 지워 다시 기기 설정을 따르게 한다(테마의 '시스템'과 같다).
 */
export function useReduceMotion() {
  const stored = useSyncExternalStore(subscribe, () => current)
  // shortcut: 기기 설정은 화면을 열 때 한 번 읽는다. 열어 둔 채 기기 설정을 바꾸면 스위치만 늦게 따라온다
  const [deviceReduces] = useState(() => window.matchMedia(REDUCE_QUERY).matches)
  return {
    reduce: stored ? stored === 'reduce' : deviceReduces,
    followsDevice: stored === null,
    setReduce: (reduce: boolean) => choose(reduce ? 'reduce' : 'full'),
    followDevice: () => choose(null),
  }
}
