import { describe, expect, it } from 'vitest'

import { activeMonths, buildWeeks, grassLevel, monthLabels } from './grass'

describe('activeMonths', () => {
  it('to가 든 달까지 최근 12달 중 제출한 달을 센다. 13달째(맨 앞 달)는 세지 않는다', () => {
    expect(
      activeMonths({
        to: '2026-11-13',
        days: [
          { date: '2025-11-20', count: 1 }, // 13달째 — 세지 않는다
          { date: '2025-12-01', count: 2 },
          { date: '2025-12-31', count: 1 }, // 같은 달은 한 번
          { date: '2026-06-10', count: 1 },
          { date: '2026-11-13', count: 4 },
        ],
      }),
    ).toBe(3)
  })

  it('해가 바뀌는 1월도 앞 해 2월부터 센다', () => {
    expect(
      activeMonths({
        to: '2027-01-05',
        days: [
          { date: '2026-01-31', count: 1 },
          { date: '2026-02-01', count: 1 },
        ],
      }),
    ).toBe(1)
  })
})

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
  it('달이 바뀐 주에만 달 이름을 붙이고, 맨 앞 주는 범위의 첫 달이다', () => {
    const labels = monthLabels(buildWeeks({ from: '2026-10-20', to: '2026-11-14', days: [] }))
    expect(labels[0]).toBe('10월')
    expect(labels.filter(Boolean)).toEqual(['10월', '11월'])
  })

  // 리뷰에서 나온 두 경우(#186). 글자가 칸보다 넓어 바로 옆 열의 이름과 포개진다.
  it('from이 토요일이라 맨 앞 주가 하루뿐이어도 같은 달 이름을 두 번 붙이지 않는다', () => {
    const labels = monthLabels(buildWeeks({ from: '2025-11-01', to: '2025-11-30', days: [] }))
    expect(labels.filter(Boolean)).toEqual(['11월'])
  })

  it('맨 앞 주의 이름이 바로 다음 주 이름과 붙으면 앞 것을 뺀다', () => {
    const labels = monthLabels(buildWeeks({ from: '2025-10-29', to: '2025-11-30', days: [] }))
    expect(labels[0]).toBeNull()
    expect(labels.filter(Boolean)).toEqual(['11월'])
  })
})
