import { describe, expect, it } from 'vitest'
import css from './index.css?raw'

/**
 * index.css의 색 대비를 라이트·다크 둘 다 계산한다 (WCAG 2.1 상대 휘도).
 *
 * 디자인 원본(tokens.json)은 저장소 밖에 있어, 색을 바꾸는 사람이 확인할 곳이 이 테스트다.
 * 글자를 새 면 위에 올리면(hover 면 포함) 아래 쌍에 더한다. #250 리뷰에서 destructive 버튼의
 * hover 면이 빠져 있어 4.5:1 아래로 떨어진 것을 놓쳤다.
 */

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`)
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

/** [글자, 면, 면 투명도, 기준]. 면은 카드(--card) 위에 놓인다고 본다. */
type Pair = [string, string, number, number]

const TONES = ['destructive', 'success', 'warning', 'info']
const PAIRS: Pair[] = [
  ['foreground', 'card', 1, 4.5],
  ['foreground', 'background', 1, 4.5],
  ['body-foreground', 'card', 1, 4.5],
  ['muted-foreground', 'card', 1, 4.5],
  ['muted-foreground', 'muted', 1, 4.5],
  ['primary-text', 'card', 1, 4.5],
  ['primary-text', 'muted', 1, 4.5],
  ['accent-foreground', 'accent', 1, 4.5],
  ['primary-foreground', 'primary', 1, 4.5],
  ['primary-foreground', 'primary-hover', 1, 4.5],
  ['highlight-foreground', 'highlight', 1, 4.5],
  ['inverse-foreground', 'inverse', 1, 4.5],
  ['inverse-muted', 'inverse', 1, 4.5],
  ['inverse-accent', 'inverse', 1, 4.5],
  ...TONES.flatMap((t): Pair[] => [
    [`${t}-text`, 'card', 1, 4.5],
    [`${t}-text`, 'muted', 1, 4.5],
    [`${t}-text`, `${t}-soft`, 1, 4.5],
    [`${t}-foreground`, t, 1, 4.5],
  ]),
  // 입력칸 경계 (WCAG 1.4.11)
  ['input', 'card', 1, 3],
  ['input', 'background', 1, 3],
  ['ring', 'card', 1, 3],
]

// 투명도 면은 테마마다 다르게 쓰는 곳이 있어 따로 둔다
const ALPHA_PAIRS: Record<keyof typeof THEMES, Pair[]> = {
  light: [
    // destructive 버튼(button.tsx), 메뉴의 위험 항목, 리포트의 취약 칩: 기본 /10, hover /15
    ['destructive-text', 'destructive', 0.1, 4.5],
    ['destructive-text', 'destructive', 0.15, 4.5],
  ],
  dark: [
    ['destructive-text', 'destructive', 0.1, 4.5],
    ['destructive-text', 'destructive', 0.2, 4.5],
  ],
}

describe.each(Object.entries(THEMES))('%s 테마 대비', (theme, vars) => {
  const card = parse(vars.card)
  const pairs = [...PAIRS, ...ALPHA_PAIRS[theme as keyof typeof THEMES]]

  it.each(pairs)('%s 글자 · %s 면 (투명도 %s) ≥ %s', (fg, bg, alpha, min) => {
    expect(vars[fg], `--${fg}`).toBeDefined()
    expect(vars[bg], `--${bg}`).toBeDefined()
    const surface = over(parse(vars[bg]), card, alpha)
    expect(ratio(over(parse(vars[fg]), surface), surface)).toBeGreaterThanOrEqual(min)
  })
})
