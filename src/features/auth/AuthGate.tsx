import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  isApiError,
  logout as logoutRequest,
  onSessionChange,
  refreshSession,
  type Me,
} from '../../api'
import { AuthContext, type AuthContextValue } from './authContext'
import { LOGIN_DONE_MESSAGE, loginErrorMessage, safeReturnTo } from './loginMessages'
import { LoginScreen } from './LoginScreen'
import { SessionExpiredDialog } from './SessionExpiredDialog'

type AuthState =
  | { kind: 'loading' }
  | { kind: 'signedOut'; error: string | null }
  | { kind: 'signedIn'; user: Me; expired: boolean }

/**
 * 로그인 흐름 (docs/api/rules.md "로그인과 소유 · FE")
 * - 앱을 열면 POST /auth/refresh. 200이면 로그인 상태, 401이면 로그인 화면
 * - /auth/callback: BE가 refresh 쿠키를 심고 보낸 곳. refresh로 토큰을 받고 returnTo로 옮긴다.
 *   팝업(로그인 만료 뒤 다시 로그인)이면 앱 창에 알리고 닫힌다.
 * - /login?error=: 로그인 실패 이유를 보인다
 * - 작업 중 refresh까지 401이면 화면을 그대로 둔 채 "로그인이 만료되었습니다" 창을 띄운다
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  // 처음 연 주소. effect에서 주소를 바꾸므로(StrictMode는 effect를 두 번 부른다) 한 번만 읽어 둔다.
  const [route] = useState(readRoute)
  const [state, setState] = useState<AuthState>(() =>
    route.kind === 'loginError' ? { kind: 'signedOut', error: route.message } : { kind: 'loading' },
  )
  const loggingOut = useRef(false)

  useEffect(() => {
    let cancelled = false
    if (route.kind === 'callback') {
      if (window.opener && notifyOpener()) {
        window.close()
        return
      }
      window.history.replaceState(null, '', route.returnTo)
    } else if (route.kind === 'app' && window.location.pathname === '/login') {
      window.history.replaceState(null, '', '/')
    } else if (route.kind === 'loginError') {
      window.history.replaceState(null, '', '/')
      return
    }

    refreshSession().then(
      (session) => {
        if (!cancelled) setState({ kind: 'signedIn', user: session.user, expired: false })
      },
      (e: unknown) => {
        if (cancelled) return
        const error = isApiError(e, 'UNAUTHENTICATED') ? null : (e as Error).message
        setState({ kind: 'signedOut', error })
      },
    )
    return () => {
      cancelled = true
    }
  }, [route])

  // 로그인·로그아웃·만료를 화면 상태로 옮긴다.
  useEffect(
    () =>
      onSessionChange((session) => {
        setState((prev) => {
          if (session) {
            // 만료 뒤 다시 로그인했으면 실패했던 요청을 다시 받는다.
            if (prev.kind === 'signedIn' && prev.expired) void qc.invalidateQueries()
            return { kind: 'signedIn', user: session.user, expired: false }
          }
          if (prev.kind === 'signedIn' && !loggingOut.current) return { ...prev, expired: true }
          return prev
        })
      }),
    [qc],
  )

  // 팝업에서 다시 로그인하면 이 창이 refresh 쿠키로 새 토큰을 받는다.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin === window.location.origin && e.data === LOGIN_DONE_MESSAGE) {
        void refreshSession().catch(() => {})
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const logout = useCallback(async () => {
    loggingOut.current = true
    try {
      await logoutRequest().catch(() => {})
      qc.clear()
      setState({ kind: 'signedOut', error: null })
    } finally {
      loggingOut.current = false
    }
  }, [qc])

  const user = state.kind === 'signedIn' ? state.user : null
  const value = useMemo<AuthContextValue | null>(
    () => (user ? { user, logout } : null),
    [user, logout],
  )

  if (state.kind === 'loading') return null
  if (state.kind === 'signedOut') return <LoginScreen error={state.error} />
  return (
    <AuthContext.Provider value={value}>
      {children}
      {state.kind === 'signedIn' && state.expired && (
        <SessionExpiredDialog
          // 닫아 두고 편집기 내용을 복사할 수 있다. 다음 요청이 다시 401이면 또 뜬다.
          onDismiss={() =>
            setState((prev) => (prev.kind === 'signedIn' ? { ...prev, expired: false } : prev))
          }
        />
      )}
    </AuthContext.Provider>
  )
}

type Route =
  { kind: 'app' } | { kind: 'callback'; returnTo: string } | { kind: 'loginError'; message: string }

function readRoute(): Route {
  const { pathname, search } = window.location
  const params = new URLSearchParams(search)
  if (pathname === '/auth/callback') {
    return { kind: 'callback', returnTo: safeReturnTo(params.get('returnTo')) }
  }
  const error = pathname === '/login' ? params.get('error') : null
  return error ? { kind: 'loginError', message: loginErrorMessage(error) } : { kind: 'app' }
}

/** 로그인 팝업이면 앱 창에 알린다. 알릴 수 없으면 false (이 창에서 그대로 로그인한다) */
function notifyOpener(): boolean {
  try {
    ;(window.opener as Window).postMessage(LOGIN_DONE_MESSAGE, window.location.origin)
    return true
  } catch {
    return false
  }
}
