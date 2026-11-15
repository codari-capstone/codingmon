import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'

import wordmark from '@/assets/brand/codingmon_wordmark.png'
import hero from '@/assets/mascot/Mascot/codingmon_hero_large.png'
import errorScene from '@/assets/scenes/error.png'
import loadingScene from '@/assets/scenes/loading.png'
import studyingScene from '@/assets/scenes/studying.png'
import successScene from '@/assets/scenes/success.png'
import thinkingScene from '@/assets/scenes/thinking.png'
import { Accordion } from '@/components/ui/accordion'
import { MENU } from '@/app/menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'
import { Stepper } from '@/components/ui/stepper'
import { useAuth } from '@/features/auth/useAuth'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { DEFAULT_PARAMS } from '@/features/problems/problemListParams'
import { problemListQuery } from '@/features/problems/problemsQuery'
import { cn } from '@/lib/utils'

const PAINS: { icon: IconName; q: string; a: string }[] = [
  {
    icon: 'x',
    q: '틀렸다는데, 어디가 틀린 거죠?',
    a: '채점 결과만으로는 원인을 찾기 어려워요. 몇 시간씩 같은 코드만 보게 돼요.',
  },
  {
    icon: 'bulb',
    q: '힌트를 봤더니 답이 다 나와요.',
    a: '조금만 도와주면 될 것 같은데, 풀이를 보면 내가 푼 게 아니게 돼요.',
  },
  {
    icon: 'chart',
    q: '늘고 있는 건지 모르겠어요.',
    a: '문제는 꾸준히 푸는데 무엇이 약한지, 다음엔 뭘 풀지 감이 안 와요.',
  },
]

// 단계 이름은 실제 힌트(HintSteps)와 같다. 시안의 '방향 → 접근법 → 핵심 아이디어'가 아니다
// 두 단계를 연 상태다. 실제처럼 연 단계만 글이 보이고, 마지막에 연 단계를 진하게 칠한다
const HINTS = [
  { title: '관찰', body: '음수만 들어오면 어떤 값이 남을까요?', state: 'opened' },
  { title: '방향', body: '처음 값을 0 대신 첫 원소로 두면 어떨까요?', state: 'latest' },
  { title: '원리', body: '아직 열지 않았어요', state: 'locked' },
] as const

const STATS = [
  { label: '맞힌 문제', value: 7 },
  { label: '틀린 문제', value: 3 },
  { label: '활동한 날', value: 70 },
]

// 장식용 잔디. 시안과 같은 식으로 63칸을 고정해 그린다
const CELL_TONES = [
  'bg-muted',
  'bg-[color-mix(in_srgb,var(--primary)_25%,var(--muted))]',
  'bg-[color-mix(in_srgb,var(--primary)_55%,var(--muted))]',
  'bg-primary',
]
const CELLS = Array.from({ length: 63 }, (_, i) => {
  const r = (i * 37 + 11) % 10
  return CELL_TONES[r < 4 ? 0 : r < 6 ? 1 : r < 8 ? 2 : 3]
})

const STEPS = [
  { label: '문제 고르기', description: '난이도와 유형으로 골라요' },
  { label: '코드 제출', description: '브라우저에서 바로 짜고 제출해요' },
  { label: 'AI 분석 받기', description: '틀린 원인과 힌트를 받아요' },
  { label: '다시 풀기', description: '고쳐서 다시 제출해요' },
]

const FAQ = [
  {
    value: 'q1',
    title: 'AI 분석은 언제 볼 수 있나요?',
    content:
      '틀렸거나 에러가 난 제출의 결과 화면에서 [AI 분석]을 누르면 볼 수 있어요. 맞힌 제출은 [AI 리뷰]로 더 나은 풀이 방향을 받을 수 있어요.',
  },
  {
    value: 'q2',
    title: 'AI가 정답 코드를 알려 주나요?',
    content: '아니요. 틀린 원인과 생각해 볼 방향만 알려 줘요. 고친 코드는 직접 써야 실력이 늘어요.',
  },
  {
    value: 'q3',
    title: '힌트는 몇 단계까지 있나요?',
    content: '문제마다 관찰 → 방향 → 원리 순서로 세 단계까지 열 수 있어요.',
  },
  {
    value: 'q4',
    title: '어떤 언어로 풀 수 있나요?',
    content: 'Python과 C++로 풀 수 있어요. 문제 풀이 화면에서 고를 수 있어요.',
  },
]

const SECTION = 'max-w-content mx-auto box-content px-6'
const H2 =
  'm-0 text-[28px] leading-[1.25] font-bold tracking-[-0.025em] text-foreground lg:text-[40px]'
const EYEBROW = 'text-primary-text m-0 text-sm font-semibold tracking-[.02em]'
const LEAD = 'text-muted-foreground m-0 text-[17px] leading-[1.7] lg:text-lg'
const CARD = 'bg-card rounded-[20px] border'
const MOCK =
  'bg-muted relative flex min-h-[320px] items-center justify-center rounded-[32px] px-4 pt-24 pb-12 sm:px-6 lg:min-h-[380px] lg:px-10'
// lg 미만도 열을 minmax(0,1fr)로 정한다. 암묵적 auto 열은 코드 예시(pre)의 폭 밑으로 줄지 않아
// 좁은 화면에서 페이지가 가로로 넘친다(#297 리뷰)
const FEATURE = 'grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16'

/** 랜딩 (LAND-01~03). 로그인 여부와 관계없이 보여 주고, 시작 버튼만 바뀐다. */
export function Component() {
  const { isAuthenticated, isLoading } = useAuth()
  // 세션을 아직 모르면 undefined. 로그인한 사람이 새로 고침한 순간 가입 버튼을 누르지 않게 한다
  const signedIn = isLoading ? undefined : isAuthenticated

  return (
    <div>
      <Hero signedIn={signedIn} />

      <section className={cn(SECTION, 'flex flex-col gap-12 pt-20 lg:pt-[120px]')}>
        <div className="flex flex-col items-center gap-3.5 text-center">
          <img src={thinkingScene} alt="" width={150} height={127} className="block" />
          <h2 className={H2}>이런 적 있죠?</h2>
        </div>
        <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-3">
          {PAINS.map((p) => (
            <li key={p.q} className={cn(CARD, 'flex flex-col gap-3.5 p-8')}>
              <span className="bg-accent text-primary-text inline-flex size-12 items-center justify-center rounded-[14px]">
                <Icon name={p.icon} size={24} />
              </span>
              <p className="text-foreground m-0 text-xl leading-[1.45] font-bold tracking-[-0.01em]">
                “{p.q}”
              </p>
              <p className="text-muted-foreground m-0 text-base leading-[1.65]">{p.a}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={cn(SECTION, 'flex flex-col gap-24 pt-24 lg:gap-[120px] lg:pt-[140px]')}>
        <div className={FEATURE}>
          <FeatureText
            eyebrow="AI 오답 분석"
            title={['어디서 틀렸는지', '줄 단위로 짚어 줘요']}
            lead="통과하지 못한 테스트와 내 코드를 함께 읽고, 놓친 경우와 원인을 쉬운 말로 설명해요. 고친 코드를 대신 써 주지는 않아요."
          />
          <div className={MOCK}>
            <SceneCorner src={errorScene} width={150} height={136} />
            <div className={cn(CARD, 'shadow-card flex w-full max-w-[420px] flex-col gap-3.5 p-6')}>
              <div className="flex items-center justify-between">
                <span className="text-foreground text-[15px] font-bold">AI 분석</span>
                <Badge tone="danger">틀렸습니다</Badge>
              </div>
              <pre className="bg-muted text-body-foreground m-0 overflow-x-auto rounded-xl px-4 py-3.5 font-mono text-[13px] leading-[1.7]">
                <span className="text-muted-foreground">3</span>
                {'  for i in range(1, len(nums)):\n'}
                <span className="text-muted-foreground">4</span>
                {'  '}
                <span className="bg-destructive-soft text-destructive-text">
                  {'    best = max(best, nums[i])'}
                </span>
              </pre>
              <p className="text-body-foreground m-0 text-sm leading-[1.65]">
                <b>4번째 줄</b>에서 음수만 있는 배열을 생각하지 못했어요.{' '}
                <span className="font-mono">best</span>의 처음 값을 다시 살펴보세요.
              </p>
            </div>
          </div>
        </div>

        <div className={FEATURE}>
          <div className="lg:order-2">
            <FeatureText
              eyebrow="단계별 힌트"
              title={['정답 말고', '다음 한 걸음만']}
              lead="막히면 힌트를 한 단계씩 열어 보세요. 관찰 → 방향 → 원리 순서로, 스스로 풀 여지를 남겨 둬요."
            />
          </div>
          <div className={MOCK}>
            <SceneCorner src={studyingScene} width={160} height={125} />
            <ol className="m-0 flex w-full max-w-[420px] list-none flex-col gap-3 p-0">
              {HINTS.map((h, i) => (
                <li
                  key={h.title}
                  className={cn(
                    CARD,
                    'flex items-center gap-3.5 px-5 py-4',
                    h.state === 'locked' && 'opacity-55',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex size-8 flex-none items-center justify-center rounded-full text-sm font-bold tabular-nums',
                      h.state === 'opened' && 'bg-accent text-primary-text',
                      h.state === 'latest' && 'bg-primary text-primary-foreground',
                      h.state === 'locked' && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-muted-foreground text-[13px] font-semibold">
                      {h.title}
                    </span>
                    <span className="text-foreground text-[15px] leading-normal">{h.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className={FEATURE}>
          <FeatureText
            eyebrow="내 학습"
            title={['조금씩 늘어나는 게', '눈에 보여요']}
            lead="푼 문제, 자주 틀리는 유형, 꾸준히 푼 날을 한곳에 모아 보여 줘요. 다음에 뭘 풀지 고르기도 쉬워져요."
            link={{ to: '/me/report', label: '학습 리포트 보기' }}
          />
          <div className={MOCK}>
            <SceneCorner src={successScene} width={150} height={125} />
            <div
              className={cn(CARD, 'shadow-card flex w-full max-w-[440px] flex-col gap-[18px] p-6')}
            >
              <dl className="m-0 grid grid-cols-3 gap-2.5">
                {STATS.map((s) => (
                  <div
                    key={s.label}
                    className="bg-muted flex flex-col gap-1 rounded-[14px] p-3 sm:p-3.5"
                  >
                    <dt className="text-muted-foreground text-xs font-semibold whitespace-nowrap">
                      {s.label}
                    </dt>
                    <dd className="text-foreground m-0 text-2xl font-bold tabular-nums">
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div aria-hidden="true" className="grid grid-cols-[repeat(21,1fr)] gap-1">
                {CELLS.map((tone, i) => (
                  <span key={i} className={cn('block aspect-square rounded-[4px]', tone)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className={cn(SECTION, 'pt-24 lg:pt-[140px]')}>
        <div className="bg-muted flex flex-col gap-10 rounded-[40px] p-8 lg:p-16">
          <div className="flex flex-col gap-3.5">
            <p className={EYEBROW}>어떻게 동작하나요</p>
            <h2 className={H2}>풀고, 틀리고, 이해하고, 다시 풀기</h2>
          </div>
          {/* 넷 다 완료로 그린다(시안 current=4). 좁은 화면은 설명이 눌리지 않게 세로로 */}
          <Stepper
            steps={STEPS}
            current={STEPS.length}
            className="hidden md:flex [&>li:last-child]:flex-none"
          />
          <Stepper
            steps={STEPS}
            current={STEPS.length}
            orientation="vertical"
            className="md:hidden"
          />
        </div>
      </section>

      <ProblemPreview sessionKnown={signedIn !== undefined} />

      <section
        className={cn(
          SECTION,
          'grid items-start gap-10 pt-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:pt-[140px]',
        )}
      >
        <div className="flex flex-col gap-3.5">
          <p className={EYEBROW}>자주 묻는 질문</p>
          <h2 className={H2}>궁금한 게 있나요?</h2>
        </div>
        <Accordion items={FAQ} defaultOpen={['q1']} />
      </section>

      <section className={cn(SECTION, 'pt-24 pb-20 lg:pt-[140px]')}>
        <div className="bg-inverse flex flex-col items-start justify-between gap-10 overflow-hidden rounded-[40px] p-8 lg:flex-row lg:items-center lg:p-[72px]">
          <div className="flex flex-col gap-5">
            <h2 className="text-inverse-foreground m-0 text-[32px] leading-[1.2] font-bold tracking-[-0.025em] lg:text-[44px]">
              오늘 한 문제부터
              <br />
              시작해 볼까요?
            </h2>
            <p className="text-inverse-muted m-0 text-lg leading-[1.7]">
              {signedIn
                ? '문제 목록에서 바로 이어서 풀 수 있어요.'
                : '가입하고 바로 첫 문제를 풀 수 있어요.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <StartButton signedIn={signedIn} />
              {signedIn !== false ? null : (
                <Button asChild size="lg" variant="glass">
                  <Link to="/problems">문제 둘러보기</Link>
                </Button>
              )}
            </div>
          </div>
          <img
            src={loadingScene}
            alt=""
            width={300}
            height={225}
            className="block h-auto max-w-full self-center"
          />
        </div>
      </section>

      <footer className="border-t">
        <div
          className={cn(
            SECTION,
            'text-muted-foreground flex flex-wrap items-center justify-between gap-4 pt-8 pb-10 text-sm',
          )}
        >
          <img src={wordmark} alt="Codingmon" width={117} height={32} className="block" />
          {/* 이용약관·개인정보처리방침은 문서가 생기면 더한다 (#244) */}
          <nav aria-label="바닥글" className="flex gap-6">
            {MENU.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-muted-foreground hover:text-foreground no-underline"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span>© 2026 Codari</span>
        </div>
      </footer>
    </div>
  )
}

/** 비로그인은 가입, 로그인한 사용자는 문제 목록 (LAND-02). 세션을 모르는 동안은 자리만 잡는다. */
function StartButton({ signedIn }: { signedIn: boolean | undefined }) {
  if (signedIn === undefined) {
    return (
      <Button size="lg" variant="accent" aria-hidden tabIndex={-1} className="invisible">
        무료로 시작하기
      </Button>
    )
  }
  return (
    <Button asChild size="lg" variant="accent">
      {signedIn ? (
        <Link to="/problems">문제 풀러 가기</Link>
      ) : (
        <Link to="/signup">무료로 시작하기</Link>
      )}
    </Button>
  )
}

function Hero({ signedIn }: { signedIn: boolean | undefined }) {
  // 상단 바의 로그인과 같이 지금 주소를 싣는다. 로그인 뒤 같은 곳으로 돌아온다(COM-07, #297 리뷰)
  const location = useLocation()
  const from = `${location.pathname}${location.search}`
  return (
    // 남색 무대는 페이지에 닿으므로 둥근 모서리 없이 좌우 끝까지 (디자인 규칙)
    <section className="bg-inverse w-full overflow-hidden">
      <div
        className={cn(
          SECTION,
          'grid items-end gap-10 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:pt-[104px]',
        )}
      >
        <div className="flex flex-col gap-6 lg:pb-20">
          <span className="bg-inverse-raised text-inverse-accent inline-flex items-center gap-2 self-start rounded-full px-3.5 py-2 text-sm font-semibold">
            <Icon name="bot" size={16} />
            AI가 오답을 같이 봐 주는 코딩 연습
          </span>
          <h1 className="text-inverse-foreground m-0 text-[36px] leading-[1.15] font-bold tracking-[-0.03em] sm:text-[44px] lg:text-[56px]">
            틀린 이유까지
            <br />
            알려 주는 코딩 연습장
          </h1>
          <p className="text-inverse-muted m-0 max-w-[520px] text-[17px] leading-[1.7] lg:text-[19px]">
            문제를 풀고 제출하면 채점에서 끝나지 않아요. 어느 줄에서, 왜 틀렸는지 AI가 짚어 주고,
            정답 대신 다음 한 걸음을 힌트로 알려 줘요.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <StartButton signedIn={signedIn} />
            <Button asChild size="lg" variant="glass">
              <a href="#how">어떻게 동작하나요?</a>
            </Button>
          </div>
          {signedIn !== false ? null : (
            <p className="text-inverse-muted m-0 text-sm">
              이미 계정이 있나요?{' '}
              <Link
                to="/login"
                state={{ from }}
                className="text-inverse-foreground font-semibold underline"
              >
                로그인
              </Link>
            </p>
          )}
        </div>

        <div className="relative flex min-h-[300px] items-end justify-center lg:min-h-[460px]">
          <img
            src={hero}
            alt="손을 흔드는 코딩몬 펭귄"
            width={350}
            height={420}
            className="relative z-[1] block h-auto w-[240px] lg:w-[350px]"
          />
          {/* 떠 있는 두 카드는 펭귄 얼굴을 가리지 않게 머리 위 양옆에 둔다. 좁은 화면에서는 뺀다 */}
          <div
            aria-hidden="true"
            className="bg-card shadow-pop absolute -top-[76px] -left-6 z-[2] hidden items-center gap-2.5 rounded-2xl px-4 py-3 lg:flex"
          >
            <span className="bg-destructive-soft text-destructive-text inline-flex size-7 items-center justify-center rounded-full">
              <Icon name="x" size={16} className="[&_path]:stroke-[3]" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground text-sm font-bold">틀렸습니다</span>
              <span className="text-muted-foreground font-mono text-xs">테스트 3 / 5 통과</span>
            </span>
          </div>
          <div
            aria-hidden="true"
            className="bg-card shadow-pop absolute -top-6 -right-6 z-[2] hidden max-w-[210px] flex-col gap-1.5 rounded-2xl px-4 py-3.5 lg:flex"
          >
            <span className="text-primary-text inline-flex items-center gap-1.5 text-[13px] font-bold">
              <Icon name="bulb" size={16} />
              힌트 1단계
            </span>
            <span className="text-body-foreground text-sm leading-[1.55]">
              빈 배열이 들어오면 어떤 값을 돌려줘야 할까요?
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeatureText({
  eyebrow,
  title,
  lead,
  link,
}: {
  eyebrow: string
  title: [string, string]
  lead: string
  link?: { to: string; label: string }
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <p className={EYEBROW}>{eyebrow}</p>
      <h2 className={H2}>
        {title[0]}
        <br />
        {title[1]}
      </h2>
      <p className={LEAD}>{lead}</p>
      {link ? (
        <Link to={link.to} className="text-primary-text self-start font-semibold">
          {link.label} →
        </Link>
      ) : null}
    </div>
  )
}

function SceneCorner({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      // w-auto는 원본 픽셀 크기가 된다. 시안의 폭을 변수로 넘긴다
      style={{ '--scene-w': `${width}px` } as React.CSSProperties}
      className="absolute -top-12 right-0 block h-auto w-[120px] lg:-right-4 lg:w-(--scene-w)"
    />
  )
}

/**
 * 문제 목록 첫 4개 (LAND-03). 문제 목록 화면과 같은 캐시를 쓴다. 불러오지 못하면 구역을 숨긴다.
 *
 * 세션을 알기 전에는 받지 않는다. 같은 키라서, 토큰이 복원되기 전에 받은 비로그인 응답(풀이
 * 상태 없음)이 [문제 풀러 가기]로 간 문제 목록에 그대로 쓰인다. ProblemListPage와 같은 선택이다 (#297 리뷰).
 */
function ProblemPreview({ sessionKnown }: { sessionKnown: boolean }) {
  const { data } = useQuery({ ...problemListQuery(DEFAULT_PARAMS), enabled: sessionKnown })
  const problems = data?.content.slice(0, 4) ?? []
  if (problems.length === 0) return null

  return (
    <section
      aria-labelledby="landing-problems"
      className={cn(SECTION, 'flex flex-col gap-8 pt-24 lg:pt-[140px]')}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3.5">
          <p className={EYEBROW}>문제</p>
          <h2 id="landing-problems" className={H2}>
            가볍게 하나 풀어 볼까요?
          </h2>
        </div>
        <Button asChild variant="secondary">
          <Link to="/problems">문제 전체 보기</Link>
        </Button>
      </div>
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {problems.map((p) => (
          <li key={p.id}>
            <Link
              to={`/problems/${p.id}`}
              className={cn(
                CARD,
                'hover:border-primary hover:shadow-hover flex h-full flex-col gap-4 p-6 no-underline transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none',
              )}
            >
              <span className="text-muted-foreground font-mono text-[13px]">#{p.id}</span>
              <span className="text-foreground text-lg font-bold tracking-[-0.01em]">
                {p.title}
              </span>
              <span className="flex">
                {/* 시안은 판정 색이지만, 난이도는 다른 화면처럼 outline이다(Badge README) */}
                <Badge tone="outline">{DIFFICULTY_LABEL[p.difficulty]}</Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
