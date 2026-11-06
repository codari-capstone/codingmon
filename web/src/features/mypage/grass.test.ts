import { describe, expect, it } from 'vitest'

import { buildWeeks, grassLevel, monthLabel } from './grass'

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

describe('monthLabel', () => {
  it('그달의 첫 주에만 달 이름을 붙이고, 맨 앞 주는 늘 붙인다', () => {
    const weeks = buildWeeks({ from: '2026-10-20', to: '2026-11-14', days: [] })
    const labels = weeks.map(monthLabel)
    expect(labels[0]).toBe('10월')
    expect(labels.filter(Boolean)).toEqual(['10월', '11월'])
  })
})
