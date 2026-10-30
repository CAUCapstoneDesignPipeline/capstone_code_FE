import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { queryClient } from './queryClient'

describe('AI-off 배포의 오류 재시도 경계', () => {
  it('AI_UNAVAILABLE와 인증 오류를 자동 재시도하지 않는다', () => {
    const retry = queryClient.getDefaultOptions().queries?.retry
    expect(typeof retry).toBe('function')
    if (typeof retry !== 'function') throw new Error('Expected retry policy')
    expect(retry(0, new ApiError('AI_UNAVAILABLE', '분석을 사용할 수 없습니다.', 503))).toBe(false)
    expect(retry(0, new ApiError('UNAUTHENTICATED', '로그인이 필요합니다.', 401))).toBe(false)
    expect(retry(0, new ApiError('NETWORK_ERROR', '연결 실패', 0))).toBe(true)
    expect(retry(1, new ApiError('NETWORK_ERROR', '연결 실패', 0))).toBe(false)
  })
})
