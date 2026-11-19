import { describe, expect, it } from 'vitest'

import { recommendedProblemId } from './recommend'

describe('recommendedProblemId (WELCOME-03)', () => {
  it('명세 14장의 9칸 표와 같다', () => {
    expect([
      [
        recommendedProblemId('NEW', 'BASICS'),
        recommendedProblemId('NEW', 'ALGORITHMS'),
        recommendedProblemId('NEW', 'CODING_TEST'),
      ],
      [
        recommendedProblemId('SOME', 'BASICS'),
        recommendedProblemId('SOME', 'ALGORITHMS'),
        recommendedProblemId('SOME', 'CODING_TEST'),
      ],
      [
        recommendedProblemId('REGULAR', 'BASICS'),
        recommendedProblemId('REGULAR', 'ALGORITHMS'),
        recommendedProblemId('REGULAR', 'CODING_TEST'),
      ],
    ]).toEqual([
      [1, 2, 3],
      [26, 5, 6],
      [4, 9, 10],
    ])
  })
})
