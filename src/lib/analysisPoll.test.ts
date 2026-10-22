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

describe('저장한 version보다 오래된 작업', () => {
  const done = (version: number): AnalysisJob => ({
    ...job('a', 'succeeded'),
    noteVersion: version,
  })

  it('새 작업이 보일 때까지 더 조회하고, 60초가 지나면 멈춘다', () => {
    let t = 0
    const next = createAnalysisPoller(
      () => t,
      () => 0,
    )
    expect(next(done(1), 1)).toBe(false)
    expect(next(done(1), 2)).toBe(POLL.fastMs)
    t = 59_999
    expect(next(done(1), 2)).toBe(POLL.slowMs)
    t = 60_000
    expect(next(done(1), 2)).toBe(false)
  })

  it('분석한 적이 없는 노트도 저장하면 작업을 기다린다. 새로 만든 빈 노트(version 0)는 기다리지 않는다', () => {
    const next = createAnalysisPoller(() => 0)
    expect(next(null, 0)).toBe(false)
    expect(next(null, 1)).toBe(POLL.fastMs)
  })

  it('작업을 아직 불러오지 않았으면 조회하지 않는다', () => {
    expect(createAnalysisPoller()(undefined, 3)).toBe(false)
  })
})
