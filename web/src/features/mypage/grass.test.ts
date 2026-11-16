import { describe, expect, it } from 'vitest'

import { buildWeeks, grassLevel, monthLabels } from './grass'

describe('buildWeeks', () => {
  // 2026-11-01은 일요일이다.
  it('일요일에 시작하는 주로 자르고, 제출이 없는 날은 0으로 채운다', () => {
    const weeks = buildWeeks({
      from: '2026-11-03',
      to: '2026-11-10',
      days: [{ date: '2026-11-04', count: 3 }],
    })

    expect(weeks).toHaveLength(2)
    // 첫 주: 일·월은 범위 밖이라 빈 자리
    expect(weeks[0]!.slice(0, 2)).toEqual([
      { date: null, count: 0 },
      { date: null, count: 0 },
    ])
    expect(weeks[0]![2]).toEqual({ date: '2026-11-03', count: 0 })
    expect(weeks[0]![3]).toEqual({ date: '2026-11-04', count: 3 })
    // 마지막 주는 to에서 끝난다(일·월·화 세 칸)
    expect(weeks[1]!.map((cell) => cell.date)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10'])
  })

  it('1년(365일)이면 오늘까지 빠짐없이 들어 있다', () => {
    const weeks = buildWeeks({ from: '2025-11-08', to: '2026-11-07', days: [] })
    const dates = weeks.flat().filter((cell) => cell.date !== null)
    expect(dates).toHaveLength(365)
    expect(dates.at(-1)!.date).toBe('2026-11-07')
  })
})

describe('grassLevel', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
    [6, 4],
    [20, 4],
  ])('하루 %i회는 %i단계', (count, level) => {
    expect(grassLevel(count)).toBe(level)
  })
})

describe('monthLabels', () => {
  it('한 해를 그리면 1월부터 12월까지 달마다 한 번씩 이름을 붙인다', () => {
    // 범위는 늘 그 해 1월 1일 ~ 12월 31일이다(계약, #253)
    const labels = monthLabels(buildWeeks({ from: '2026-01-01', to: '2026-12-31', days: [] }))
    expect(labels[0]).toBe('1월')
    expect(labels.filter(Boolean)).toEqual(Array.from({ length: 12 }, (_, i) => `${i + 1}월`))
  })

  // 리뷰에서 나온 경우(#186). 2025-11-01은 토요일이라 맨 앞 주가 그날뿐이다.
  it('맨 앞 주가 하루뿐이어도 같은 달 이름을 두 번 붙이지 않는다', () => {
    const labels = monthLabels(buildWeeks({ from: '2025-11-01', to: '2025-11-30', days: [] }))
    expect(labels.filter(Boolean)).toEqual(['11월'])
  })
})
