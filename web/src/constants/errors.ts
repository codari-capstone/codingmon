/** 서버가 RFC 9457(Problem Details)로 내려주는 오류 응답. 모든 필드가 없을 수 있다. */
export interface ProblemDetail {
  type?: string
  title?: string
  status?: number
  detail?: string
}

export interface UserMessage {
  title: string
  description: string
  /** 같은 요청을 다시 보내면 될 수도 있는지. 다시 시도 버튼을 보일지 정한다. */
  retryable: boolean
}

/**
 * type별 문구. 서버의 detail은 영어 기술 문장이라 사용자에게 보여 주지 않고,
 * 여기 적은 한국어 문구만 쓴다. 원문은 화면에서 접어 두고 보여 준다.
 *
 * API 명세(#2)가 확정되면 type 값을 명세와 맞춘다.
 */
const BY_TYPE: Record<string, UserMessage> = {
  '/problems/judge-unavailable': {
    title: '지금은 제출할 수 없습니다',
    description: '채점 서버가 응답하지 않습니다. 이 제출은 시도 횟수에 넣지 않습니다.',
    retryable: true,
  },
  '/problems/ai-quota-exceeded': {
    title: '오늘 AI 분석을 다 썼습니다',
    description: '하루 20회까지 쓸 수 있습니다. 채점 결과와 쉬운 설명은 그대로 볼 수 있습니다.',
    retryable: false,
  },
  '/problems/ai-unavailable': {
    title: 'AI 분석을 가져오지 못했습니다',
    description: '잠시 후 다시 눌러 주세요. 채점 결과는 그대로 볼 수 있습니다.',
    retryable: true,
  },
}

const BY_STATUS: Record<number, UserMessage> = {
  400: {
    title: '요청을 처리할 수 없습니다',
    description: '입력한 내용을 다시 확인해 주세요.',
    retryable: false,
  },
  401: {
    title: '로그인이 필요합니다',
    description: '로그인하면 이어서 쓸 수 있습니다.',
    retryable: false,
  },
  403: {
    title: '권한이 없습니다',
    description: '이 화면을 볼 수 있는 권한이 없습니다.',
    retryable: false,
  },
  404: {
    title: '찾을 수 없습니다',
    description: '주소가 바뀌었거나 삭제된 내용입니다.',
    retryable: false,
  },
  429: {
    title: '잠시만 기다려 주세요',
    description: '요청이 너무 많습니다. 조금 뒤에 다시 시도해 주세요.',
    retryable: true,
  },
}

const FALLBACK: UserMessage = {
  title: '문제가 발생했습니다',
  description: '잠시 후 다시 시도해 주세요. 계속되면 팀에 알려 주세요.',
  retryable: true,
}

function asProblemDetail(value: unknown): ProblemDetail | null {
  if (typeof value !== 'object' || value === null) return null
  return value as ProblemDetail
}

export function toUserMessage(problem: unknown): UserMessage {
  const detail = asProblemDetail(problem)
  if (!detail) return FALLBACK

  if (detail.type && BY_TYPE[detail.type]) {
    return BY_TYPE[detail.type]
  }

  if (typeof detail.status === 'number') {
    const byStatus = BY_STATUS[detail.status]
    if (byStatus) return byStatus
    // 표에 없는 코드는 5xx만 다시 시도할 수 있다고 본다.
    return { ...FALLBACK, retryable: detail.status >= 500 }
  }

  return FALLBACK
}
