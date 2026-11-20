import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import type { CurrentUser, Language } from '@/api/types'
import guide from '@/assets/scenes/guide.png'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RadioGroup } from '@/components/ui/radio-group'
import { Stepper } from '@/components/ui/stepper'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { problemDetailQuery } from '@/features/solve/solveQuery'
import { solvePath } from '@/features/solve/solvePath'
import { BLANK_PIXEL } from '@/lib/utils'
import {
  EXPERIENCES,
  GOALS,
  LANGUAGES,
  recommendedProblemId,
  type Experience,
  type Goal,
} from './recommend'
import { markWelcomeSeen } from './welcomeQuery'

const STEPS = [{ label: '언어' }, { label: '경험' }, { label: '목표' }]

// 선택지는 폭과 상관없이 한 줄에 하나씩 쌓는다. 옆으로 셋을 놓으면 '알고리즘 실력 키우기'가 두 줄로 꺾인다
const STACKED = '[&>div]:grid-cols-1'
const TITLES = [
  '어떤 언어로 풀어 볼까요?',
  '코딩 문제를 풀어 본 적 있나요?',
  '무엇을 하고 싶나요?',
  '첫 문제를 골라 뒀어요!',
]
const BUBBLES = [
  '반가워요! 세 가지만 물어볼게요.',
  '수준에 맞는 문제부터 보여 줄게요.',
  '목표에 맞게 문제를 추천해요.',
  '준비 끝! 같이 풀어 봐요.',
]
const DONE = 3

function labelOf<T extends string>(list: readonly { value: T; label: string }[], value: T) {
  return list.find((item) => item.value === value)?.label
}

/** 처음 안내 (WELCOME-01~03). 언어 → 경험 → 목표 → 추천 첫 문제. */
export function Component() {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [language, setLanguage] = useState<Language>()
  const [experience, setExperience] = useState<Experience>()
  const [goal, setGoal] = useState<Goal>()

  // 열리기만 하면 본 것이다(명세: 끝까지 보지 않고 나가도 다시 띄우지 않음).
  // 실패해도 알리지 않는다 — 사용자가 할 일이 없고, 다음 로그인에 한 번 더 뜰 뿐이다.
  const seen = useMutation({
    mutationFn: markWelcomeSeen,
    onSuccess: () =>
      queryClient.setQueryData<CurrentUser | null>(ME_QUERY_KEY, (user) =>
        user ? { ...user, welcomeSeen: true } : user,
      ),
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })
  // StrictMode는 효과를 두 번 돌린다. 요청은 한 번만 보낸다
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    seen.mutate()
  }, [seen])

  // 단계가 바뀌면 낭독기와 키보드가 새 질문부터 시작하게 제목으로 옮긴다. 열 때는 건드리지 않는다.
  // '첫 렌더' 표시로 막으면 StrictMode가 효과를 두 번 돌려 열자마자 옮긴다. 지난 단계와 비교한다(#324 리뷰)
  const heading = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef(step)
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    heading.current?.focus()
  }, [step])

  const answered = [language, experience, goal][step] !== undefined
  const problemId =
    experience !== undefined && goal !== undefined ? recommendedProblemId(experience, goal) : null
  const problem = useQuery({
    ...problemDetailQuery(problemId ?? 0),
    enabled: step === DONE && problemId !== null,
  })

  return (
    <div className="flex justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="bg-card shadow-card dark:border-border grid border border-transparent w-full max-w-[1040px] overflow-hidden rounded-[32px] lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* 말풍선과 마스코트. 좁은 화면에서는 질문이 먼저라 뺀다 */}
        <div className="bg-accent hidden flex-col justify-between gap-5 px-8 pt-9 lg:flex">
          <p className="bg-card shadow-pop relative m-0 self-start rounded-[18px] px-[18px] py-3.5 text-[15px] leading-[1.55] font-semibold">
            {BUBBLES[step]}
            <span
              aria-hidden="true"
              className="bg-card absolute -bottom-2 left-10 size-4 rotate-45"
            />
          </p>
          {/* 패널이 숨는 좁은 화면에서는 그림을 받지 않는다 (LoginPage와 같은 방식) */}
          <picture className="block self-center">
            <source media="(min-width: 64rem)" srcSet={guide} />
            <img src={BLANK_PIXEL} alt="" width={300} height={343} className="block" />
          </picture>
        </div>

        <div className="flex flex-col gap-7 p-6 sm:px-11 sm:py-10">
          <div className="flex flex-col gap-4">
            <Stepper steps={STEPS} current={step} />
            <div className="flex flex-col gap-1.5">
              <p className="text-primary-text m-0 text-sm font-semibold">
                {step < DONE ? `질문 ${step + 1} / 3` : '추천'}
              </p>
              <h1 ref={heading} tabIndex={-1} className="page-title outline-none">
                {TITLES[step]}
              </h1>
            </div>
          </div>

          {step === 0 ? (
            <RadioGroup
              variant="card"
              className={STACKED}
              name="language"
              label={<span className="sr-only">{TITLES[0]}</span>}
              options={[...LANGUAGES]}
              value={language}
              onChange={setLanguage}
            />
          ) : null}
          {step === 1 ? (
            <RadioGroup
              variant="card"
              className={STACKED}
              name="experience"
              label={<span className="sr-only">{TITLES[1]}</span>}
              options={[...EXPERIENCES]}
              value={experience}
              onChange={setExperience}
            />
          ) : null}
          {step === 2 ? (
            <RadioGroup
              variant="card"
              className={STACKED}
              name="goal"
              label={<span className="sr-only">{TITLES[2]}</span>}
              options={[...GOALS]}
              value={goal}
              onChange={setGoal}
            />
          ) : null}

          {step === DONE ? (
            <div className="flex flex-col gap-3.5">
              <div className="border-primary flex flex-col gap-3 rounded-[20px] border-2 p-6">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-primary-text text-[13px] font-semibold">추천 첫 문제</span>
                  {problem.data ? (
                    <Badge tone="outline">{DIFFICULTY_LABEL[problem.data.difficulty]}</Badge>
                  ) : null}
                </div>
                {/* 포커스는 제목에 있다. 늦게 도착하는 추천 결과는 낭독기가 따로 읽게 한다 */}
                <div role="status">
                  {problem.data ? (
                    <p className="m-0 text-[22px] font-bold tracking-[-0.02em]">
                      <span className="text-muted-foreground mr-1.5 font-mono text-base font-medium">
                        #{problem.data.id}
                      </span>
                      {problem.data.title}
                    </p>
                  ) : problem.isError ? (
                    <p className="text-muted-foreground m-0 text-[15px]">
                      추천 문제를 지금 열 수 없어요. 문제 목록에서 골라 주세요.
                    </p>
                  ) : null}
                </div>
                {problem.isPending ? <ListSkeleton rows={1} /> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  labelOf(LANGUAGES, language!),
                  labelOf(EXPERIENCES, experience!),
                  labelOf(GOALS, goal!),
                ].map((picked) => (
                  <Badge key={picked} tone="brand">
                    {picked}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
                  이전
                </Button>
              ) : null}
              <Link
                to="/problems"
                className="text-muted-foreground hover:text-foreground px-2 text-sm font-semibold"
              >
                건너뛰기
              </Link>
            </div>
            {step < DONE ? (
              <Button
                type="button"
                size="lg"
                disabled={!answered}
                onClick={() => setStep(step + 1)}
              >
                다음
              </Button>
            ) : problem.isError ? (
              <Button asChild size="lg">
                <Link to="/problems">문제 목록 보기</Link>
              </Button>
            ) : problem.data ? (
              <Button asChild size="lg">
                <Link to={solvePath(problem.data.id, language!)}>첫 문제 풀러 가기</Link>
              </Button>
            ) : (
              // 받는 동안에는 열 수 있는 문제인지 모른다. 숨겨진 문제로 보내지 않게 꺼 둔다
              <Button type="button" size="lg" disabled>
                첫 문제 풀러 가기
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
