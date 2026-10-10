import { buildUrl, request, setSession } from './client'
import type { AuthProviderList, DevTokenRequest, Me, TokenResponse } from './types'

/** 로그인 화면의 버튼 목록. 로그인 전에 부른다. */
export function listAuthProviders(signal?: AbortSignal): Promise<AuthProviderList> {
  return request('GET', '/auth/providers', { auth: false, signal })
}

/**
 * 소셜 로그인 시작 주소. fetch가 아니라 페이지(또는 팝업)를 이 주소로 이동시킨다.
 * returnTo는 로그인 뒤 돌아올 앱 안의 경로 ('/'로 시작).
 */
export function oauthLoginUrl(provider: string, returnTo = '/'): string {
  return buildUrl(`/auth/oauth2/${encodeURIComponent(provider)}`, { returnTo })
}

/** 개발용 로그인 (local 프로필에서만 열린다). refresh 쿠키도 받아 새로고침 뒤에도 로그인이 이어진다. */
export async function devLogin(input: DevTokenRequest = {}): Promise<TokenResponse> {
  const session = await request<TokenResponse>('POST', '/auth/dev/token', {
    auth: false,
    body: { ...input, issueRefreshCookie: true },
  })
  setSession(session)
  return session
}

/** 이 기기의 로그인을 끊는다. 서버 응답과 관계없이 메모리의 토큰은 지운다. */
export async function logout(): Promise<void> {
  try {
    await request<void>('POST', '/auth/logout', { auth: false })
  } finally {
    setSession(null)
  }
}

export function getMe(signal?: AbortSignal): Promise<Me> {
  return request('GET', '/auth/me', { signal })
}
