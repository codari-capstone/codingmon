import { Link } from 'react-router'

import { LEGAL_DOCS } from './legalInfo'

/**
 * 가입 버튼 위의 동의 안내 (LEGAL-04, 이용약관 제5조). 이메일 가입과 GitHub 닉네임 정하기가 함께 쓴다.
 * 문서는 새 탭으로 연다 — 같은 탭으로 가면 받아 둔 인증번호와 입력한 값이 사라진다.
 * 주소와 이름은 바닥글과 같은 LEGAL_DOCS에서 읽는다.
 */
export function SignupConsent() {
  const { terms, privacy } = LEGAL_DOCS
  return (
    <p className="text-muted-foreground m-0 text-center text-[13px] leading-[1.6] break-keep">
      [가입 완료]를 누르면{' '}
      <Link to={terms.to} target="_blank" rel="noopener" className={LINK}>
        {terms.label}
      </Link>
      과{' '}
      <Link to={privacy.to} target="_blank" rel="noopener" className={LINK}>
        {privacy.label}
      </Link>
      에 동의한 것으로 봐요.
    </p>
  )
}

const LINK = 'text-primary-text font-semibold underline underline-offset-[0.15em]'
