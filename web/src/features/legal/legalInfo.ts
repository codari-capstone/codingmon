// 이용약관·개인정보 처리방침·환불 정책이 함께 쓰는 값 (#335).
// 바닥글(SiteFooter)과 세 문서가 이 파일 하나를 읽는다. 문서마다 따로 적으면 서로 다른 말을 하게 된다.

/** 아직 정하지 않은 값. 화면에는 `〈상호 확정 후 기재〉`처럼 보인다 */
const pending = (what: string) => `〈${what} 확정 후 기재〉`
const isPending = (value: string) => value.endsWith(' 확정 후 기재〉')

/**
 * 사업자 정보 (전자상거래법 제10조, 사이버몰 운영자의 신원 표시).
 * 사업자 등록 전이라 모두 자리표시다. 등록하면 여기만 고친다 — 바닥글·약관·환불 정책에 함께 바뀐다.
 */
export const BUSINESS = {
  name: pending('상호'),
  ceo: pending('대표자'),
  registrationNo: pending('사업자등록번호'),
  mailOrderNo: pending('통신판매업 신고번호'),
  address: pending('주소'),
  phone: pending('전화번호'),
  hosting: pending('호스팅 서비스 제공자'),
  /** 개인정보 보호책임자 (개인정보 보호법 제31조) */
  privacyOfficer: pending('개인정보 보호책임자'),
} as const

/**
 * 사업자 등록을 마쳤는지. 사업자등록번호를 채우면 true가 되고, 바닥글에 사업자 정보 줄이 나타난다.
 * 그 전에는 자리표시만 늘어선 줄을 바닥글에 두지 않는다(문서의 사업자 정보 표에는 그대로 보인다).
 */
export const BUSINESS_REGISTERED = !isPending(BUSINESS.registrationNo)

/** 문의·환불 요청·권리 행사를 받는 주소. 화면에서는 SupportEmail 하나로 그린다 */
export const SUPPORT_EMAIL = 'contact@codingmon.tech'

export type LegalDocId = 'terms' | 'privacy' | 'refund'

/** 문서 주소와 이름. 바닥글과 가입 안내가 모두 여기서 읽는다(라우트는 router.tsx의 같은 주소) */
export const LEGAL_DOCS: Record<LegalDocId, { to: string; label: string }> = {
  terms: { to: '/terms', label: '이용약관' },
  privacy: { to: '/privacy', label: '개인정보 처리방침' },
  refund: { to: '/refund', label: '환불 정책' },
}

export interface LegalVersion {
  /** 시행일. 드롭다운에 보이는 이름이다 */
  label: string
  path: string
}

/**
 * 문서별 판 목록. **맨 앞이 현재 판**이다.
 * 개정할 때는 지금 판을 `/terms/2026-11-20` 같은 주소로 옮겨 라우트를 하나 더하고, 새 판을 맨 앞에 더한다.
 * 시행일은 공지한 날부터 7일 뒤(회원에게 불리하면 30일 뒤)로 잡는다(이용약관 제3조).
 */
export const LEGAL_VERSIONS: Record<LegalDocId, LegalVersion[]> = {
  terms: [{ label: '2026.11.21', path: '/terms' }],
  privacy: [{ label: '2026.11.21', path: '/privacy' }],
  refund: [{ label: '2026.11.21', path: '/refund' }],
}

/**
 * 화면이 보여 주는 판의 시행일을 본문 문장용으로. `2026.11.21` → `2026년 11월 21일`.
 * 부칙이 드롭다운과 어긋나지 않게 한다. 지난 판으로 옮긴 문서도 자기 주소를 넘기면 자기 날짜를 받는다.
 */
export function effectiveDate(versions: LegalVersion[], path: string): string {
  const version = versions.find((v) => v.path === path) ?? versions[0]
  const [y, m, d] = version.label.split('.').map(Number)
  return `${y}년 ${m}월 ${d}일`
}

/** 바닥글의 약관 링크. 처리방침은 다른 링크와 구분되게 굵게 보인다(개인정보위 작성지침) */
export const LEGAL_LINKS: { to: string; label: string; strong?: true }[] = [
  LEGAL_DOCS.terms,
  { ...LEGAL_DOCS.privacy, strong: true },
  LEGAL_DOCS.refund,
]
