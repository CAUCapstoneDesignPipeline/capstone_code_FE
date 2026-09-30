import type { ErrorBody, Note, ServerErrorCode } from './types'

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
