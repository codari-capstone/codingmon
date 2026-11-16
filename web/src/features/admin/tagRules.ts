/**
 * 개념 태그 입력 규칙 (계약 `ConceptTagInput`, 서버 `AdminConceptTagController`).
 * 화면의 검사와 목이 함께 쓴다 — 두 벌로 적으면 한쪽만 바뀌어 화면과 목이 어긋난다.
 */
export const TAG_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const TAG_SLUG_MAX = 80
export const TAG_NAME_MAX = 100
