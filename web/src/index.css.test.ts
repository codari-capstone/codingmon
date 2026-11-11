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

function parse(value: string): Rgba {
  if (value.startsWith('#')) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
    return [r, g, b, 1]
  }
  const m = /rgba?\(([^)]+)\)/.exec(value)
  if (!m) throw new Error(`색으로 읽을 수 없는 값: ${value}`)
  const [r, g, b, a = 1] = m[1].split(',').map(Number)
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
  ['primary-text', 'card', 1, 4.5, 'card'],
  ['primary-text', 'muted', 1, 4.5, 'card'],
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
  // destructive 버튼·리포트 취약 칩·메뉴 위험 항목의 기본 면(/10). 버튼은 Footer의 옅은 면에도 놓인다.
  // 버튼 hover는 꽉 찬 면 + destructive-foreground라 위 쌍이 맡는다
  ['destructive-text', 'destructive', 0.1, 4.5, 'card'],
  ['destructive-text', 'destructive', 0.1, 4.5, 'muted'],
  // 입력칸 경계와 포커스 띠(UNDERLINE_FIELD: --input 밑줄, --ring 포커스, --destructive 오류) (WCAG 1.4.11)
  ...['input', 'ring', 'destructive'].flatMap((line): Pair[] => [
    [line, 'card', 1, 3, 'card'],
    [line, 'background', 1, 3, 'card'],
    [line, 'muted', 1, 3, 'card'],
  ]),
]

// 테마마다 다르게 쓰는 투명도: 메뉴의 위험 항목은 다크에서 focus 면이 /20이다 (dropdown-menu.tsx)
const THEME_PAIRS: Record<keyof typeof THEMES, Pair[]> = {
  light: [],
  dark: [['destructive-text', 'destructive', 0.2, 4.5, 'card']],
}

describe.each(Object.entries(THEMES))('%s 테마 대비', (theme, vars) => {
  const pairs = [...PAIRS, ...THEME_PAIRS[theme as keyof typeof THEMES]]

  it.each(pairs)('%s · %s 면 (투명도 %s) ≥ %s, %s 위', (fg, bg, alpha, min, under) => {
    for (const name of [fg, bg, under]) expect(vars[name], `--${name}`).toBeDefined()
    const surface = over(parse(vars[bg]), parse(vars[under]), alpha)
    expect(ratio(over(parse(vars[fg]), surface), surface)).toBeGreaterThanOrEqual(min)
  })
})
