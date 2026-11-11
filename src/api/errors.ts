import type { ErrorBody, Note, ServerErrorCode, TopicList } from './types'

/** 서버에 닿지 못했을 때(네트워크 끊김, 서버 꺼짐, CORS) 앱이 붙이는 코드. 계약의 코드와 겹치지 않는다. */
export type ApiErrorCode = ServerErrorCode | 'NETWORK_ERROR'

/** 모든 API 실패는 이 오류로 바뀐다. 화면은 HTTP 상태가 아니라 code로 분기한다. */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  /** 서버에 닿지 못했으면 0 */
  readonly status: number
  readonly details: Record<string, unknown>

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details ?? {}
  }
}

export function isApiError(e: unknown, code?: ApiErrorCode): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code)
}

export function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== 'object' || value === null) return false
  const error = (value as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return typeof code === 'string' && typeof message === 'string'
}

/**
 * 추천 답(POST /recommendations/{id}/feedback)이 409 RECOMMENDATION_STALE: 근거가 바뀌었거나(stale)
 * 사라진(evidence_lost) 추천에는 답할 수 없다. 답은 기록되지 않는다 (11/04 회의, docs PR #22).
 */
export function isRecommendationStale(e: unknown): e is ApiError {
  return isApiError(e, 'RECOMMENDATION_STALE')
}

/**
 * 추천 답이 409 REVIEW_CONFLICT: 이미 최종 답(understood·known)을 남긴 추천에 다른 답을 보냈다 (docs PR #22).
 * 다른 창 등에서 이미 답한 카드이므로 답한 카드로 본다.
 */
export function isRecommendationAnswered(e: unknown): e is ApiError {
  return isApiError(e, 'REVIEW_CONFLICT')
}

/** NOTE_TITLE_TAKEN: 겹치는 제목 목록 (주제 삭제가 막혔을 때 채워진다) */
export function titleTakenTitles(e: ApiError): string[] {
  const titles = e.details.titles
  return Array.isArray(titles) ? titles.filter((t): t is string => typeof t === 'string') : []
}

/** NOTE_CONFLICT: 서버에 있는 현재 노트 */
export function conflictCurrent(e: ApiError): Note | undefined {
  const current = e.details.current
  if (typeof current !== 'object' || current === null) return undefined
  const note = current as Partial<Note>
  return typeof note.id === 'string' && typeof note.version === 'number'
    ? (current as Note)
    : undefined
}

/** TOPIC_ORDER_CONFLICT: 서버에 있는 현재 주제 목록 */
export function orderConflictCurrent(e: ApiError): TopicList | undefined {
  const current = e.details.current
  if (typeof current !== 'object' || current === null) return undefined
  const list = current as Partial<TopicList>
  return Array.isArray(list.topics) && typeof list.unassignedNoteCount === 'number'
    ? (current as TopicList)
    : undefined
}

export interface FieldError {
  field: string
  reason: string
}

/** VALIDATION_FAILED: 필드별 실패 이유 */
export function validationFields(e: ApiError): FieldError[] {
  const fields = e.details.fields
  if (!Array.isArray(fields)) return []
  return fields.filter(
    (f): f is FieldError =>
      typeof f === 'object' &&
      f !== null &&
      typeof (f as FieldError).field === 'string' &&
      typeof (f as FieldError).reason === 'string',
  )
}
