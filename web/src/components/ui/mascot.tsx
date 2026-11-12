import { cn } from 'cn'

// 그림 파일은 src/assets/mascot/<묶음>/<이름>.png. 번들러가 주소로 바꿔 준다.
const FILES = import.meta.glob('/src/assets/mascot/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const url = (path: string) => FILES[`/src/assets/mascot/${path}`]

/** 장면: [파일, 원본 너비, 원본 높이]. 값은 디자인 시스템의 Mascot과 같다. */
const SCENES = {
  hello: ['Mascot/codingmon_hero_large.png', 834, 1000],
  hero: ['Mascot/codingmon_hero.png', 278, 348],
  front: ['Mascot/codingmon_front.png', 142, 187],
  side: ['Mascot/codingmon_side.png', 112, 187],
  back: ['Mascot/codingmon_back.png', 126, 187],
  studying: ['Learning/learning.png', 252, 160],
  solving: ['Learning/problem_solving.png', 225, 153],
  ai: ['Learning/ai_recommend.png', 212, 157],
  ranking: ['Learning/ranking.png', 192, 165],
  'level-up': ['Learning/level_up.png', 196, 157],
  community: ['Learning/community.png', 252, 141],
  success: ['States/success.png', 192, 175],
  incorrect: ['States/incorrect.png', 167, 169],
  hint: ['States/hint.png', 162, 174],
  loading: ['States/loading_basic.png', 191, 162],
  waiting: ['States/loading_waiting.png', 207, 154],
  empty: ['States/empty_data.png', 194, 165],
  error: ['States/error.png', 174, 169],
  trophy: ['Extras/solved_trophy.png', 223, 172],
  retry: ['Extras/failed_try_again.png', 212, 161],
  idea: ['Extras/idea_lightbulb.png', 154, 151],
  skeleton: ['Extras/loading_skeleton.png', 228, 185],
  'empty-box': ['Extras/empty_box.png', 204, 162],
  'access-denied': ['Extras/access_denied.png', 195, 166],
  maintenance: ['Extras/maintenance.png', 244, 168],
  rest: ['Extras/rest.png', 233, 151],
  rocket: ['Extras/rocket.png', 217, 155],
} as const

const FACES = {
  happy: ['Expressions/happy.png', 116, 89],
  excited: ['Expressions/excited.png', 114, 96],
  focused: ['Expressions/focused.png', 106, 91],
  curious: ['Expressions/curious.png', 110, 105],
  surprised: ['Expressions/surprised.png', 119, 103],
  idea: ['Expressions/idea.png', 116, 92],
  love: ['Expressions/love.png', 117, 94],
  tired: ['Expressions/tired.png', 116, 95],
  sleeping: ['Expressions/sleeping.png', 117, 104],
  proud: ['Expressions/proud.png', 119, 95],
} as const

export type MascotPose = keyof typeof SCENES | 'thinking'
export type MascotExpression = keyof typeof FACES

interface MascotProps {
  /** 장면. 기본 hello. thinking은 hint와 같은 그림이다 */
  pose?: MascotPose
  /** 머리 표정 (pose 대신) */
  expression?: MascotExpression
  /** face는 원형 아바타 (expression 기본 happy) */
  variant?: 'full' | 'face'
  /** 너비 px. 기본 장면 160 · 표정 120 · 얼굴 40 */
  size?: number
  /** 뜻을 전할 때만. 없으면 장식(alt="") */
  label?: string
  className?: string
}

/**
 * 코딩몬의 파란 후드 펭귄. 장면·표정·원형 아바타 중 하나로 보여 준다.
 * 한 화면에 두 번 쓰지 않고, 상황과 다른 그림을 쓰지 않으며(틀렸을 때 success, 오류에 hello),
 * 늘리거나 뒤집지 않는다. hello만 큰 원본이고 나머지는 원본 너비보다 크게 쓰지 않는다.
 */
export function Mascot({
  pose = 'hello',
  expression,
  variant = 'full',
  size,
  label,
  className,
}: MascotProps) {
  const face = expression ?? (variant === 'face' ? 'happy' : null)
  if (face) {
    const [file, w, h] = FACES[face]
    const width = size ?? (variant === 'face' ? 40 : 120)
    const img = (
      <img
        src={url(file)}
        alt=""
        draggable={false}
        width={width}
        height={Math.round((width * h) / w)}
        className={variant === 'face' ? 'mb-[-6%] h-auto w-[112%]' : 'block h-auto'}
      />
    )
    return variant === 'face' ? (
      <span
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        style={{ width, height: width }}
        className={cn(
          'bg-accent inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full leading-[0]',
          className,
        )}
      >
        {img}
      </span>
    ) : (
      <span
        role={label ? 'img' : undefined}
        aria-label={label}
        className={cn('inline-block leading-[0]', className)}
      >
        {img}
      </span>
    )
  }

  const [file, w, h] = SCENES[pose === 'thinking' ? 'hint' : pose]
  const width = size ?? 160
  return (
    <img
      src={url(file)}
      alt={label ?? ''}
      draggable={false}
      width={width}
      height={Math.round((width * h) / w)}
      className={cn('block h-auto shrink-0 object-contain select-none', className)}
    />
  )
}
