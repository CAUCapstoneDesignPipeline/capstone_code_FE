import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendRecommendationFeedback, type Note } from '../api'
import {
  afterNoteDeleted,
  afterNoteMoved,
  afterNoteSaved,
  afterTopicCreated,
  afterTopicDeleted,
  afterTopicRenamed,
  GALAXY_REFRESH_REASONS,
  keys,
  onRecommendationJobPolled,
  submitRecommendationAnswer,
} from './queries'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  sendRecommendationFeedback: vi.fn(),
}))

const note: Note = {
  id: 'n1',
  topicId: 't1',
  title: '재시도 정책',
  body: '본문',
  version: 2,
  createdAt: '2026-11-18T00:00:00Z',
  updatedAt: '2026-11-18T00:00:00Z',
}

describe('Galaxy를 다시 받는 때 (PR #46)', () => {
  let qc: QueryClient
  // 최상위와 한 주제 안을 받아 둔 상태
  const levels = [keys.topicGraph(null), keys.topicGraph('t1')]
  const refreshed = () => levels.map((k) => qc.getQueryState(k)?.isInvalidated)

  beforeEach(() => {
    qc = new QueryClient()
    for (const k of levels) qc.setQueryData(k, { topics: [], keywords: [], edges: [] })
    vi.mocked(sendRecommendationFeedback).mockReset().mockResolvedValue(undefined)
  })

  it('주제 생성', () => {
    void afterTopicCreated(qc)
    expect(refreshed()).toEqual([true, true])
  })

  it('주제 이름 변경', () => {
    void afterTopicRenamed(qc)
    expect(refreshed()).toEqual([true, true])
  })

  it('주제 삭제', () => {
    afterTopicDeleted(qc, 't1')
    expect(refreshed()).toEqual([true, true])
  })

  it('노트 삭제', () => {
    afterNoteDeleted(qc, 'n1')
    expect(refreshed()).toEqual([true, true])
  })

  it('노트의 주제 이동', () => {
    afterNoteMoved(qc, { ...note, topicId: 't2' })
    expect(refreshed()).toEqual([true, true])
  })

  it('추천 작업 완료', () => {
    const job = (status: 'pending' | 'completed') =>
      ({ id: 'j', noteId: 'n1', status, outcome: null, recommendations: [] }) as never
    onRecommendationJobPolled(qc, job('pending'), job('completed'))
    expect(refreshed()).toEqual([true, true])
  })

  it("'이해함' 기록", async () => {
    await submitRecommendationAnswer(qc, 'r1', 'understood')
    expect(refreshed()).toEqual([true, true])
  })

  it('노트 본문 저장으로는 다시 받지 않는다 (페이지 그래프는 다시 받는다)', () => {
    qc.setQueryData(keys.graph, { nodes: [], edges: [] })
    afterNoteSaved(qc, { ...note, body: '바뀐 본문', version: 3 })
    expect(refreshed()).toEqual([false, false])
    expect(qc.getQueryState(keys.graph)?.isInvalidated).toBe(true)
  })

  it('주제 이동(BE #141 전)은 자리만 있다', () => {
    expect(GALAXY_REFRESH_REASONS).toHaveProperty('topicMoved')
    expect(Object.keys(GALAXY_REFRESH_REASONS)).toEqual([
      'recommendationCompleted',
      'understood',
      'topicCreated',
      'topicRenamed',
      'topicDeleted',
      'topicMoved',
      'noteDeleted',
      'noteMoved',
    ])
  })
})

describe('Galaxy 무효화는 queries.ts의 refreshGalaxy 한 곳에서만', () => {
  /** 테스트가 아닌 src 파일의 원문 (경로 → 내용) */
  const sources = Object.entries(
    import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  )

  it('keys.galaxy를 무효화하는 코드는 refreshGalaxy 하나뿐이다', () => {
    expect(sources.length).toBeGreaterThan(20)
    const hits = sources.flatMap(([file, text]) => {
      const count = (text.match(/queryKey:\s*keys\.galaxy\b/g) ?? []).length
      return count > 0 ? [[file, count] as const] : []
    })
    expect(hits).toEqual([['./queries.ts', 1]])
    const queries = sources.find(([file]) => file === './queries.ts')?.[1] ?? ''
    expect(queries).toMatch(
      /export function refreshGalaxy[^{]*\{\s*return qc\.invalidateQueries\(\{ queryKey: keys\.galaxy \}\)/,
    )
  })
})
