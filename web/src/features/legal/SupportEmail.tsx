import { SUPPORT_EMAIL } from './legalInfo'

/** 문의 주소 링크. 세 문서와 바닥글이 함께 쓴다. 글자 모양은 놓인 자리(문서 본문·바닥글)가 정한다 */
export function SupportEmail({ className }: { className?: string }) {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className={className}>
      {SUPPORT_EMAIL}
    </a>
  )
}
