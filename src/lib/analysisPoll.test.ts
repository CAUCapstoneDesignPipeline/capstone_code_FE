import { describe, expect, it } from 'vitest'
import type { AnalysisJob } from '../api'
import { createAnalysisPoller, POLL } from './analysisPoll'

const job = (id: string, status: AnalysisJob['status']): AnalysisJob => ({
  id,
  noteId: 'n',
  noteVersion: 1,
  status,
  errorMessage: null,
  createdAt: '2026-10-22T00:00:00Z',
  startedAt: null,
  finishedAt: null,
})

describe('분석 상태 폴링 간격', () => {
  it('작업이 없거나 끝났으면 멈춘다', () => {
    const next = createAnalysisPoller()
    expect(next(null)).toBe(false)
    expect(next(job('a', 'succeeded'))).toBe(false)
    expect(next(job('a', 'failed'))).toBe(false)
  })

  it('대기·진행 중이면 2초, 30초가 지나면 5초 + 0~1초', () => {
    let t = 0
    const next = createAnalysisPoller(
      () => t,
      () => 0.5,
    )
    expect(next(job('a', 'pending'))).toBe(POLL.fastMs)
    t = 29_999
    expect(next(job('a', 'running'))).toBe(POLL.fastMs)
    t = 30_000
    expect(next(job('a', 'running'))).toBe(5500)
  })

  it('다른 작업으로 바뀌면 그 작업부터 다시 잰다', () => {
    let t = 0
    const next = createAnalysisPoller(() => t)
    next(job('a', 'running'))
    t = 40_000
    expect(next(job('b', 'pending'))).toBe(POLL.fastMs)
  })
})
