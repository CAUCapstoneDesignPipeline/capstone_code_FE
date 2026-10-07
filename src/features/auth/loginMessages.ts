// 로그인 화면 문구 (기능명세서 7.1)

/** BE 콜백이 /login?error=<code>로 보낸 실패 이유 */
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  access_denied: '로그인을 취소했습니다.',
  signup_not_allowed: '이 계정은 사용할 수 없습니다. 허용된 계정으로 로그인하세요.',
  email_not_verified: '이메일이 확인되지 않은 계정입니다. 이메일을 확인한 뒤 다시 로그인하세요.',
  oauth_failed: '로그인하지 못했습니다. 잠시 후 다시 시도하세요.',
}

export function loginErrorMessage(code: string): string {
  return LOGIN_ERROR_MESSAGES[code] ?? LOGIN_ERROR_MESSAGES.oauth_failed
}

/** 로그인 팝업이 앱 창에 로그인 완료를 알릴 때 쓰는 메시지 */
export const LOGIN_DONE_MESSAGE = 'capstone:login-done'

/** returnTo는 앱 안의 경로만 받는다 ('/'로 시작하고 '//'가 아님). 아니면 '/' */
export function safeReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : '/'
}
