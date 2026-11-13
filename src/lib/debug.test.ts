import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type AnalysisJob } from '../api'
import {
  analysisDebugErrorMessage,
  analysisDebugSuccessMessage,
  isAnalysisDebugEnabled,
} from './debug'

describe('isAnalysisDebugEnabled', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('개발 서버에서는 늘 켜진다', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DEBUG_ANALYSIS', '')
    expect(isAnalysisDebugEnabled()).toBe(true)
  })

  it('빌드에서는 VITE_DEBUG_ANALYSIS=true일 때만 켜진다', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEBUG_ANALYSIS', '')
    expect(isAnalysisDebugEnabled()).toBe(false)
    vi.stubEnv('VITE_DEBUG_ANALYSIS', '1')
    expect(isAnalysisDebugEnabled()).toBe(false)
    vi.stubEnv('VITE_DEBUG_ANALYSIS', 'true')
    expect(isAnalysisDebugEnabled()).toBe(true)
  })
})

describe('디버그 분석 요청 문구', () => {
  it('성공: job id 앞 8자, status, noteVersion', () => {
    const job = { id: '0123456789abcdef', noteVersion: 7, status: 'running' } as AnalysisJob
    expect(analysisDebugSuccessMessage(job)).toBe('분석 요청됨: job 01234567 · running · v7')
  })

  it('실패는 code로 나누고, AI_UNAVAILABLE이면 reason을 보인다', () => {
    expect(
      analysisDebugErrorMessage(
        new ApiError('AI_UNAVAILABLE', 'x', 503, { reason: 'NOT_DEPLOYED' }),
      ),
    ).toContain('AI_UNAVAILABLE (reason: NOT_DEPLOYED)')
    expect(analysisDebugErrorMessage(new ApiError('NOT_FOUND', 'x', 404))).toContain('NOT_FOUND')
    expect(analysisDebugErrorMessage(new ApiError('NETWORK_ERROR', '끊김', 0))).toContain(
      'NETWORK_ERROR (끊김)',
    )
  })
})
