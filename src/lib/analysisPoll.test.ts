import { describe, expect, it } from 'vitest'
import type { AnalysisJob } from '../api'
import { analysisMismatch, createAnalysisPoller, POLL } from './analysisPoll'

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

  it('분석한 적이 없는 노트는 열기만 해서는 기다리지 않고, 연 뒤에 저장하면 첫 작업을 기다린다', () => {
    const next = createAnalysisPoller(() => 0)
    expect(next(null, 5)).toBe(false) // 열 때 version 5
    expect(next(null, 5)).toBe(false)
    expect(next(null, 6)).toBe(POLL.fastMs) // 저장
  })

  it('새로 만든 빈 노트도 첫 저장 뒤에 첫 작업을 기다린다', () => {
    const next = createAnalysisPoller(() => 0)
    expect(next(null, 0)).toBe(false)
    expect(next(null, 1)).toBe(POLL.fastMs)
  })

  it('작업을 아직 불러오지 않았으면 조회하지 않는다', () => {
    expect(createAnalysisPoller()(undefined, 3)).toBe(false)
  })
})

describe('폴링한 작업과 그래프의 작업이 어긋날 때', () => {
  it('분석이 끝났는데 그래프가 진행 중일 때 것이면 그래프만 다시 받는다', () => {
    expect(analysisMismatch(job('a', 'succeeded'), job('a', 'running'))).toEqual({
      graph: 'a:succeeded|a:running',
      analysis: null,
    })
  })

  it('그래프가 다른 작업 것이면 분석 상태도 다시 받는다 (어느 쪽이 최신인지 서버가 정한다)', () => {
    const r = analysisMismatch(job('a', 'succeeded'), job('b', 'pending'))
    expect(r.graph).not.toBeNull()
    expect(r.analysis).not.toBeNull()
    expect(analysisMismatch(null, job('b', 'succeeded'))).toEqual({
      graph: null,
      analysis: 'undefined:undefined|b:succeeded',
    })
  })

  it('맞으면, 진행 중이면, 아직 불러오지 않았으면 아무것도 하지 않는다', () => {
    const none = { graph: null, analysis: null }
    expect(analysisMismatch(job('a', 'failed'), job('a', 'failed'))).toEqual(none)
    expect(analysisMismatch(job('b', 'running'), job('a', 'succeeded'))).toEqual(none)
    expect(analysisMismatch(undefined, job('a', 'succeeded'))).toEqual(none)
    expect(analysisMismatch(job('a', 'succeeded'), undefined)).toEqual(none)
    expect(analysisMismatch(null, null)).toEqual(none)
  })
})
