import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  isRecommendationAnswered,
  isRecommendationStale,
  sendRecommendationFeedback,
} from '../api'
import type { Recommendation } from '../api'
import { markStale, type RecommendationAnswer } from '../lib/recommendations'
import { keys, submitRecommendationAnswer } from './queries'

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
