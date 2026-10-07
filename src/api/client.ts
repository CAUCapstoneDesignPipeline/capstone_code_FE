import { ApiError, isApiError, isErrorBody } from './errors'
import type { TokenResponse } from './types'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** 이 시간 안에 응답이 끝나지 않으면 NETWORK_ERROR로 본다 (서버가 멈춰도 화면이 계속 기다리지 않게) */
export const REQUEST_TIMEOUT_MS = 10_000

export interface RequestOptions {
  query?: Record<string, string | undefined>
  body?: unknown
  signal?: AbortSignal
  /** false면 Authorization 헤더를 붙이지 않고 401에 refresh도 하지 않는다 (로그인 전에 부르는 /auth/*) */
  auth?: boolean
}

// --- 로그인 상태 (docs/api/rules.md "로그인과 소유 · FE") ---
// 액세스 토큰은 메모리에만 둔다. localStorage·sessionStorage에 넣지 않는다.

let accessToken: string | null = null
let refreshing: Promise<TokenResponse> | null = null
const sessionListeners = new Set<(session: TokenResponse | null) => void>()

export function getAccessToken(): string | null {
  return accessToken
}

/** 로그인(refresh·개발용 토큰)으로 받은 토큰을 쓰기 시작하거나, null로 로그아웃한다. 구독자에게 알린다. */
export function setSession(session: TokenResponse | null) {
  accessToken = session?.accessToken ?? null
  sessionListeners.forEach((l) => l(session))
}

/** 로그인·로그아웃·로그인 만료(null)를 듣는다 */
export function onSessionChange(listener: (session: TokenResponse | null) => void) {
  sessionListeners.add(listener)
  return () => {
    sessionListeners.delete(listener)
  }
}

/**
 * refresh 쿠키로 새 액세스 토큰을 받는다. 실패하면 UNAUTHENTICATED.
 * refresh 토큰은 쓸 때마다 바뀌므로 한 탭 안에서는 요청 하나를 같이 기다리고,
 * 여러 탭 사이에서는 navigator.locks로 한 번에 하나만 보낸다 (먼저 끝난 탭이 심은 새 쿠키를 다음 탭이 쓴다).
 */
export function refreshSession(): Promise<TokenResponse> {
  refreshing ??= withRefreshLock(() =>
    request<TokenResponse>('POST', '/auth/refresh', { auth: false }),
  )
    .then(
      (session) => {
        setSession(session)
        return session
      },
      (e: unknown) => {
        if (isApiError(e, 'UNAUTHENTICATED')) setSession(null)
        throw e
      },
    )
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? locks.request('capstone-auth-refresh', fn) : fn()
}

// --- 요청 ---

function baseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL
  if (!url) throw new Error('VITE_API_BASE_URL이 없습니다. .env.example을 .env.local로 복사하세요.')
  return url.replace(/\/+$/, '')
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
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
 * 로그인이 필요한 요청이 UNAUTHENTICATED를 받으면 refresh를 한 번 하고 다시 보낸다.
 */
export async function request<T>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const auth = options.auth ?? true
  const sentToken = accessToken
  try {
    return await send<T>(method, path, options, auth ? sentToken : null)
  } catch (e) {
    if (!auth || !isApiError(e, 'UNAUTHENTICATED')) throw e
    // 그 사이 다른 요청이 이미 새 토큰을 받았으면 refresh 없이 그 토큰으로 다시 보낸다.
    if (accessToken === null || accessToken === sentToken) await refreshSession()
    return send<T>(method, path, options, accessToken)
  }
}

async function send<T>(
  method: Method,
  path: string,
  { query, body, signal }: RequestOptions,
  token: string | null,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

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
      // refresh 쿠키(Path=/api/auth)는 /auth/* 요청에만 필요하다.
      credentials: path.startsWith('/auth/') ? 'include' : 'same-origin',
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
