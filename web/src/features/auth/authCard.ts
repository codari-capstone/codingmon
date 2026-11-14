/** 회원가입·비밀번호 찾기의 가운데 카드 (디자인 Signup·PasswordReset). 바탕은 라우트의 pageTone subtle */
export const AUTH_CARD =
  'bg-card shadow-card mx-auto my-6 flex w-full max-w-[480px] flex-col gap-[22px] rounded-[28px] p-6 sm:my-6 sm:p-10 dark:border'

/** 카드 맨 아래 다른 화면으로 가는 한 줄 */
export const AUTH_FOOT = 'text-muted-foreground m-0 text-center text-sm'

export const AUTH_LINK = 'text-primary-text font-semibold hover:underline'

/**
 * 입력 + 버튼 한 줄(FieldRow)을 좁은 화면에서 접는다. FieldRow는 칸에 min-w-0을 주는데, 그대로면
 * 320px에서 칸이 글자 몇 개 폭까지 줄어든다. 같은 자리(변형)에 값을 덮어 칸이 160px 아래로
 * 줄지 않게 하고, 그보다 좁으면 버튼이 다음 줄로 내려간다.
 */
export const WRAP_ROW = 'flex-wrap [&>[data-slot=field]]:min-w-40'
