import { describe, expect, it } from 'vitest'
import raw from './index.css?raw'

/**
 * index.css의 색 대비를 라이트·다크 둘 다 계산한다 (WCAG 2.1 상대 휘도).
 *
 * 디자인 원본(tokens.json)은 저장소 밖에 있어, 색을 바꾸는 사람이 확인할 곳이 이 테스트다.
 * 글자를 새 면 위에 올리면(hover 면 포함) 아래 쌍에 더한다. #250 리뷰에서 destructive 버튼의
 * hover 면이 빠져 있어 4.5:1 아래로 떨어진 것을 놓쳤다.
 */

// 주석을 걷어낸다. 옛 값을 적어 둔 주석(`/* 이전 값 --muted: #e5e8ee; */`)이 실제 선언을 덮어쓰면
// 대비 회귀가 있어도 통과하거나, 멀쩡한데 실패한다.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`)
  if (start === -1) throw new Error(`index.css에서 ${selector} 블록을 찾지 못했다`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  )
}

const LIGHT = block(':root')
const THEMES = { light: LIGHT, dark: { ...LIGHT, ...block('.dark') } }

type Rgba = [number, number, number, number]

/**
 * `#rrggbb`와 `rgb()`·`rgba()`만 읽는다. 3자리·8자리 hex 같은 다른 형식은 NaN이나 알파 누락으로
 * 조용히 틀린 대비를 내므로 던진다. 형식을 늘리려면 여기를 먼저 고친다.
 */
function parse(value: string): Rgba {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
    return [r, g, b, 1]
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(value)
  const parts = m?.[1].split(',').map(Number)
  if (!parts || ![3, 4].includes(parts.length) || parts.some(Number.isNaN)) {
    throw new Error(`대비 테스트가 읽을 수 없는 색: ${value} (#rrggbb 또는 rgb()·rgba()로 적는다)`)
  }
  const [r, g, b, a = 1] = parts
  return [r, g, b, a]
}

/** 반투명 색을 바탕 위에 합성한다. `alpha`는 Tailwind의 `/15` 같은 투명도 수식어. */
function over(fg: Rgba, bg: Rgba, alpha = 1): Rgba {
  const a = fg[3] * alpha
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1) as Rgba
}

function luminance([r, g, b]: Rgba): number {
  const [R, G, B] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function ratio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * [글자(또는 선), 면, 면 투명도, 기준, 면이 놓인 자리].
 * 반투명 면은 놓인 자리에 따라 결과가 달라진다. 카드뿐 아니라 옅은 면(대화상자 Footer,
 * 카드 안 묶음) 위에도 놓이면 그 자리를 따로 적는다 — #250 2차 리뷰에서 Footer 위
 * destructive hover가 이렇게 빠져 있었다.
 */
type Pair = [string, string, number, number, string]

const TONES = ['destructive', 'success', 'warning', 'info']
const PAIRS: Pair[] = [
  ['foreground', 'card', 1, 4.5, 'card'],
  ['foreground', 'background', 1, 4.5, 'card'],
  ['body-foreground', 'card', 1, 4.5, 'card'],
  ['muted-foreground', 'card', 1, 4.5, 'card'],
  ['muted-foreground', 'muted', 1, 4.5, 'card'],
  // 관리자 읽기 전용(fieldset disabled)의 꺼진 칸: muted 면 위 본문 글자 (AdminProblemFormPage)
  ['foreground', 'muted', 1, 4.5, 'card'],
  // 메뉴 항목(본문색)과 그 focus 면, 카드형 라디오의 선택 면(옅은 파랑) 위 설명 글자
  ['body-foreground', 'muted', 1, 4.5, 'card'],
  ['foreground', 'accent', 1, 4.5, 'card'],
  ['muted-foreground', 'accent', 1, 4.5, 'card'],
  ['primary-text', 'card', 1, 4.5, 'card'],
  ['primary-text', 'muted', 1, 4.5, 'card'],
  // 아바타 이니셜(AppHeader·MyPage): bg-primary/15 위 text-primary-text. 헤더는 바탕 위, 마이페이지는 카드 위
  ['primary-text', 'primary', 0.15, 4.5, 'card'],
  ['primary-text', 'primary', 0.15, 4.5, 'background'],
  // ErrorState: bg-destructive/5 위 제목·설명 글자와 아이콘(비텍스트 3:1). 카드 위에도 바탕 위에도 놓인다
  ['foreground', 'destructive', 0.05, 4.5, 'card'],
  ['foreground', 'destructive', 0.05, 4.5, 'background'],
  ['muted-foreground', 'destructive', 0.05, 4.5, 'card'],
  ['muted-foreground', 'destructive', 0.05, 4.5, 'background'],
  ['destructive', 'destructive', 0.05, 3, 'card'],
  ['destructive', 'destructive', 0.05, 3, 'background'],
  ['accent-foreground', 'accent', 1, 4.5, 'card'],
  ['primary-foreground', 'primary', 1, 4.5, 'card'],
  ['primary-foreground', 'primary-hover', 1, 4.5, 'card'],
  ['highlight-foreground', 'highlight', 1, 4.5, 'card'],
  ['inverse-foreground', 'inverse', 1, 4.5, 'card'],
  ['inverse-muted', 'inverse', 1, 4.5, 'card'],
  ['inverse-accent', 'inverse', 1, 4.5, 'card'],
  ...TONES.flatMap((t): Pair[] => [
    [`${t}-text`, 'card', 1, 4.5, 'card'],
    [`${t}-text`, 'muted', 1, 4.5, 'card'],
    [`${t}-text`, `${t}-soft`, 1, 4.5, 'card'],
    [`${t}-foreground`, t, 1, 4.5, 'card'],
  ]),
  // 리포트 취약 칩의 면(bg-destructive/10, ReportPage). 위험 버튼·메뉴 위험 항목은 #255·#257부터
  // destructive-soft 면이라 위 `${t}-text`·`${t}-soft` 쌍이 맡는다. 옅은 면 위 쌍은 칩이 옮겨 가도 깨지지 않게 둔다
  ['destructive-text', 'destructive', 0.1, 4.5, 'card'],
  ['destructive-text', 'destructive', 0.1, 4.5, 'muted'],
  // Button soft(옅은 파랑 면 + 파랑 글자), dark(글자색 면 + 바탕색 글자, hover는 본문색 면), glass(남색 무대 위 반투명 면)
  ['primary-text', 'accent', 1, 4.5, 'card'],
  ['background', 'foreground', 1, 4.5, 'card'],
  ['background', 'body-foreground', 1, 4.5, 'card'],
  // inverse-raised는 반투명이라 남색 무대(inverse) 위에서 계산한다. glass 버튼과 CodeBlock 강조 줄(#233)이 쓴다
  ['inverse-foreground', 'inverse-raised', 1, 4.5, 'inverse'],
  ['inverse-muted', 'inverse-raised', 1, 4.5, 'inverse'],
  // 표시 부품(#233): Alert·HintBox 본문은 옅은 색 면 위의 본문 글자다
  ...['accent', 'info-soft', 'success-soft', 'warning-soft', 'destructive-soft'].map(
    (soft): Pair => ['body-foreground', soft, 1, 4.5, 'card'],
  ),
  ['body-foreground', 'muted', 1, 4.5, 'card'],
  // StatCard inverse의 변화량(굵은 13px 글자)
  ['highlight', 'inverse', 1, 4.5, 'card'],
  // 입력칸 경계와 포커스 띠(FIELD_BOX: --input 테두리, --ring 포커스, --destructive 오류) (WCAG 1.4.11)
  ...['input', 'ring', 'destructive'].flatMap((line): Pair[] => [
    [line, 'card', 1, 3, 'card'],
    [line, 'background', 1, 3, 'card'],
    [line, 'muted', 1, 3, 'card'],
  ]),
]

// 테마마다 다른 쌍
// Progress·LoadingState 막대는 바탕과 3:1이어야 한다(비텍스트). 바탕은 밝은 모드 muted, 다크 background다.
// 디자인 시스템의 success 막대(--success)는 밝은 모드에서, 다크의 막대·바탕(border)은 3:1에 못 미쳐
// 막대는 success-text, 다크 바탕은 background로 쓴다 (#233).
const THEME_PAIRS: Record<keyof typeof THEMES, Pair[]> = {
  light: [
    ['primary', 'muted', 1, 3, 'card'],
    ['success-text', 'muted', 1, 3, 'card'],
  ],
  dark: [
    // pill 탭의 지금 탭: 다크는 칩 면이 --border다 (tabs.tsx)
    ['foreground', 'border', 1, 4.5, 'card'],
    ['primary', 'background', 1, 3, 'card'],
    ['success-text', 'background', 1, 3, 'card'],
  ],
}

describe.each(Object.entries(THEMES))('%s 테마 대비', (theme, vars) => {
  const pairs = [...PAIRS, ...THEME_PAIRS[theme as keyof typeof THEMES]]

  it.each(pairs)('%s · %s 면 (투명도 %s) ≥ %s, %s 위', (fg, bg, alpha, min, under) => {
    for (const name of [fg, bg, under]) expect(vars[name], `--${name}`).toBeDefined()
    const surface = over(parse(vars[bg]), parse(vars[under]), alpha)
    expect(ratio(over(parse(vars[fg]), surface), surface)).toBeGreaterThanOrEqual(min)
  })
})
