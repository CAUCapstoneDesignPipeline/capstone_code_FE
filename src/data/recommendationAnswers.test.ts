import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  isRecommendationAnswered,
  isRecommendationStale,
  sendRecommendationFeedback,
} from '../api'
import type { Recommendation } from '../api'
import { markStale, type RecommendationAnswer } from '../lib/recommendations'
import { keys, onRecommendationJobPolled, submitRecommendationAnswer } from './queries'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  sendRecommendationFeedback: vi.fn(),
}))

const send = vi.mocked(sendRecommendationFeedback)

describe('추천 답 보내기', () => {
  let qc: QueryClient
  const answers = () =>
    qc.getQueryData<Record<string, RecommendationAnswer>>(keys.recommendationAnswers) ?? {}
  const sending = () => qc.getQueryData<Record<string, number>>(keys.recommendationSending) ?? {}

  beforeEach(() => {
    qc = new QueryClient()
    send.mockReset()
  })

  it('성공하면 답 기록에 남고 전송 중 표시가 지워진다', async () => {
    send.mockResolvedValue(undefined)
    await submitRecommendationAnswer(qc, 'a', 'known')
    expect(answers()).toEqual({ a: 'known' })
    expect(sending()).toEqual({})
  })

  it('409 RECOMMENDATION_STALE이면 답 기록에 남지 않고, stale로 판단할 수 있는 오류를 던진다', async () => {
    send.mockRejectedValue(
      new ApiError('RECOMMENDATION_STALE', '근거가 바뀌어 답할 수 없습니다.', 409),
    )
    const error = await submitRecommendationAnswer(qc, 'b', 'understood').catch((e: unknown) => e)
    expect(isRecommendationStale(error)).toBe(true)
    expect(answers()).toEqual({})
    expect(sending()).toEqual({})

    // 패널은 이 오류를 받아 카드를 stale로 바꾼다 (답 버튼이 막힌다)
    const cards = [
      { id: 'a', freshness: 'current' },
      { id: 'b', freshness: 'current' },
      { id: 'c', freshness: 'evidence_lost' },
    ] as Recommendation[]
    expect(markStale(cards, 'b').map((r) => r.freshness)).toEqual([
      'current',
      'stale',
      'evidence_lost',
    ])
    // 이미 막힌 카드는 그 상태를 둔다
    expect(markStale(cards, 'c')[2].freshness).toBe('evidence_lost')
  })

  it('409 REVIEW_CONFLICT는 stale이 아니라 이미 답한 추천으로 판단한다', async () => {
    send.mockRejectedValue(new ApiError('REVIEW_CONFLICT', '이미 답했습니다.', 409))
    const error = await submitRecommendationAnswer(qc, 'e', 'known').catch((e: unknown) => e)
    expect(isRecommendationAnswered(error)).toBe(true)
    expect(isRecommendationStale(error)).toBe(false)
  })

  it('409가 아닌 실패는 stale로 보지 않는다 (카드가 원래 자리로 돌아오는 기존 동작)', async () => {
    send.mockRejectedValue(new ApiError('INTERNAL', '서버 오류', 500))
    const error = await submitRecommendationAnswer(qc, 'c', 'known').catch((e: unknown) => e)
    expect(isRecommendationStale(error)).toBe(false)
    expect(answers()).toEqual({})
    expect(isRecommendationAnswered(error)).toBe(false)
    // HTTP 상태가 아니라 code로 판단한다: 다른 code의 409는 stale이 아니다
    expect(isRecommendationStale(new ApiError('NOTE_CONFLICT', '충돌', 409))).toBe(false)
  })

  it('409가 와도 이전에 남긴 답(이해가 안 됨)은 그대로 되돌린다', async () => {
    send.mockResolvedValueOnce(undefined)
    await submitRecommendationAnswer(qc, 'd', 'confused')
    send.mockRejectedValueOnce(new ApiError('RECOMMENDATION_STALE', 'stale', 409))
    await submitRecommendationAnswer(qc, 'd', 'understood').catch(() => {})
    expect(answers()).toEqual({ d: 'confused' })
  })
})

describe('Galaxy를 다시 받는 때 (PR #46 리뷰 1)', () => {
  const galaxyLevel = keys.topicGraph(null)
  const stale = (qc: QueryClient) => qc.getQueryState(galaxyLevel)?.isInvalidated
  let qc: QueryClient
  beforeEach(() => {
    qc = new QueryClient()
    qc.setQueryData(galaxyLevel, { topics: [], keywords: [], edges: [] })
    send.mockReset()
  })

  it('노트 저장 등으로 페이지 그래프(["graph"])를 다시 받아도 Galaxy는 다시 받지 않는다', async () => {
    await qc.invalidateQueries({ queryKey: keys.graph })
    expect(stale(qc)).toBe(false)
  })

  it("'이해함'을 기록하면 다시 받는다. 다른 답·실패면 아니다", async () => {
    send.mockResolvedValue(undefined)
    await submitRecommendationAnswer(qc, 'a', 'known')
    expect(stale(qc)).toBe(false)
    send.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', '연결 실패', 0))
    await submitRecommendationAnswer(qc, 'b', 'understood').catch(() => {})
    expect(stale(qc)).toBe(false)
    await submitRecommendationAnswer(qc, 'c', 'understood')
    expect(stale(qc)).toBe(true)
  })

  it('추천 작업이 진행 중에서 끝남(completed)으로 바뀌면 다시 받는다', () => {
    const job = (status: 'pending' | 'completed') =>
      ({ id: 'j', noteId: 'n', status, outcome: null, recommendations: [] }) as never
    onRecommendationJobPolled(qc, job('pending'), job('pending'))
    expect(stale(qc)).toBe(false)
    onRecommendationJobPolled(qc, job('completed'), job('completed'))
    expect(stale(qc)).toBe(false)
    onRecommendationJobPolled(qc, job('pending'), job('completed'))
    expect(stale(qc)).toBe(true)
  })

  it("최상위 키는 null로 두어 'root'라는 id의 주제와 겹치지 않는다", () => {
    expect(keys.topicGraph(null)).not.toEqual(keys.topicGraph('root'))
    expect(keys.topicGraph('x')[0]).not.toBe(keys.graph[0])
  })
})

describe('다시 보내기 (노트에 넣은 뒤 이해함, Issue #43)', () => {
  let qc: QueryClient
  const answers = () =>
    qc.getQueryData<Record<string, RecommendationAnswer>>(keys.recommendationAnswers) ?? {}

  beforeEach(() => {
    vi.useFakeTimers()
    qc = new QueryClient()
    send.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('실패하면 정한 간격으로 같은 답을 다시 보내고, 성공하면 답이 남는다', async () => {
    send
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR', '연결하지 못했습니다.', 0))
      .mockResolvedValueOnce(undefined)
    const done = submitRecommendationAnswer(qc, 'a', 'understood', { retryDelaysMs: [1000, 2000] })
    await vi.advanceTimersByTimeAsync(0)
    expect(send).toHaveBeenCalledTimes(1)
    // 다시 보내는 동안에도 답은 반영된 채다 (카드가 깜박이지 않는다)
    expect(answers()).toEqual({ a: 'understood' })
    await vi.advanceTimersByTimeAsync(1000)
    await done
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith('a', 'understood')
    expect(answers()).toEqual({ a: 'understood' })
  })

  it('끝내 보내지 못하면 (처음 + 다시 2번) 답을 되돌리고 오류를 던진다', async () => {
    send.mockRejectedValue(new ApiError('AI_UNAVAILABLE', '잠시 사용할 수 없습니다.', 503))
    const done = submitRecommendationAnswer(qc, 'a', 'understood', {
      retryDelaysMs: [1000, 2000],
    }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await done).toBeInstanceOf(ApiError)
    expect(send).toHaveBeenCalledTimes(3)
    expect(answers()).toEqual({})
  })

  it('409(RECOMMENDATION_STALE·REVIEW_CONFLICT)는 다시 보내지 않는다', async () => {
    for (const code of ['RECOMMENDATION_STALE', 'REVIEW_CONFLICT'] as const) {
      send.mockReset()
      send.mockRejectedValue(new ApiError(code, '막힘', 409))
      const error = await submitRecommendationAnswer(qc, 'b', 'understood', {
        retryDelaysMs: [1000, 2000],
      }).catch((e: unknown) => e)
      expect(send).toHaveBeenCalledTimes(1)
      expect(
        code === 'REVIEW_CONFLICT' ? isRecommendationAnswered(error) : isRecommendationStale(error),
      ).toBe(true)
    }
  })
})
