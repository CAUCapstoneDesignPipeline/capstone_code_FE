import { ApiError, isErrorBody } from './errors'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** 이 시간 안에 응답이 끝나지 않으면 NETWORK_ERROR로 본다 (서버가 멈춰도 화면이 계속 기다리지 않게) */
export const REQUEST_TIMEOUT_MS = 10_000

export interface RequestOptions {
  query?: Record<string, string | undefined>
  body?: unknown
  signal?: AbortSignal
}

function baseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL
  if (!url) throw new Error('VITE_API_BASE_URL이 없습니다. .env.example을 .env.local로 복사하세요.')
  return url.replace(/\/+$/, '')
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, value)
  }
  const qs = params.toString()
  return `${baseUrl()}${path}${qs ? `?${qs}` : ''}`
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * 요청 하나를 보내고 성공 응답 본문을 돌려준다. 204면 undefined.
 * 실패는 모두 ApiError로 던진다. 요청 취소(AbortError)만 그대로 던진다.
 * REQUEST_TIMEOUT_MS 안에 끝나지 않으면 NETWORK_ERROR.
 */
export async function request<T>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { query, body, signal } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  // 호출한 쪽의 취소(signal)와 시간 제한 중 먼저 오는 쪽으로 끊는다.
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  let res: Response
  let data: unknown
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (res.status === 204) return undefined as T
    data = await readJson(res)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new ApiError('NETWORK_ERROR', '서버가 응답하지 않습니다.', 0)
    }
    throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없습니다.', 0)
  }

  if (res.ok) return data as T

  if (isErrorBody(data)) {
    const { code, message, details } = data.error
    throw new ApiError(code, message, res.status, details)
  }
  // 계약의 Error 모양이 아닌 응답. BE와 공유할 수 있게 콘솔에 남긴다.
  console.warn('[api] 계약과 다른 오류 응답', method, path, res.status, data)
  throw new ApiError(
    'INTERNAL',
    '일시적인 오류가 발생했습니다. 잠시 후 다시 시도하세요.',
    res.status,
  )
}
