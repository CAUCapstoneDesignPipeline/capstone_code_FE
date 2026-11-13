import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, requestNoteAnalysis, type AnalysisJob } from '../api'
import { keys, noteAnalysisRequestOptions } from './queries'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  requestNoteAnalysis: vi.fn(),
}))

const post = vi.mocked(requestNoteAnalysis)

const job: AnalysisJob = {
  id: '0123456789abcdef',
  noteId: 'n1',
  noteVersion: 3,
  status: 'pending',
  createdAt: '2026-11-13T00:00:00Z',
}

describe('디버그 분석 요청 mutation', () => {
  let qc: QueryClient
  const run = () => new MutationObserver(qc, noteAnalysisRequestOptions(qc, 'n1')).mutate()

  beforeEach(() => {
    // 기본값으로 retry를 켜 두어도 이 mutation은 다시 보내지 않아야 한다
    qc = new QueryClient({ defaultOptions: { mutations: { retry: 3, retryDelay: 0 } } })
    post.mockReset()
  })

  it('202로 받은 작업을 분석 상태 캐시에 그대로 넣는다 (폴링이 이어받는다)', async () => {
    post.mockResolvedValue(job)
    await expect(run()).resolves.toEqual(job)
    expect(post).toHaveBeenCalledWith('n1')
    expect(qc.getQueryData(keys.noteAnalysis('n1'))).toEqual(job)
  })

  it('503 AI_UNAVAILABLE이면 다시 보내지 않고 캐시도 건드리지 않는다', async () => {
    post.mockRejectedValue(new ApiError('AI_UNAVAILABLE', 'off', 503, { reason: 'NOT_DEPLOYED' }))
    await expect(run()).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' })
    expect(post).toHaveBeenCalledTimes(1)
    expect(qc.getQueryData(keys.noteAnalysis('n1'))).toBeUndefined()
  })
})
