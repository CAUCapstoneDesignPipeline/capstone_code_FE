import { describe, expect, it } from 'vitest'
import { loginErrorMessage, safeReturnTo } from './loginMessages'

describe('loginErrorMessage', () => {
  it('콜백 오류 코드마다 7.1 문구를 돌려준다', () => {
    expect(loginErrorMessage('access_denied')).toBe('로그인을 취소했습니다.')
    expect(loginErrorMessage('signup_not_allowed')).toContain('허용된 계정')
  })

  it('모르는 코드는 그 밖의 실패 문구', () => {
    expect(loginErrorMessage('???')).toBe(loginErrorMessage('oauth_failed'))
  })
})

describe('safeReturnTo', () => {
  it('앱 안의 경로만 그대로 둔다', () => {
    expect(safeReturnTo('/notes?x=1')).toBe('/notes?x=1')
    expect(safeReturnTo(null)).toBe('/')
    expect(safeReturnTo('https://evil.example')).toBe('/')
    expect(safeReturnTo('//evil.example')).toBe('/')
    expect(safeReturnTo('/\\evil')).toBe('/')
  })
})
