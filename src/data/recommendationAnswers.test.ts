import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, isRecommendationStale, sendRecommendationFeedback } from '../api'
import type { Recommendation } from '../api'
import { markStale, statusOf, type RecommendationAnswer } from '../lib/recommendations'
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

  it('409(근거가 바뀐 추천)면 답 기록에 남지 않고, stale로 판단할 수 있는 오류를 던진다', async () => {
    // 계약에 맞는 code가 없어 가짜 서버가 쓰는 가정 code. FE는 code가 아니라 409로 판단한다
    send.mockRejectedValue(
      new ApiError('RECOMMENDATION_STALE' as never, '근거가 바뀌어 답할 수 없습니다.', 409),
    )
    const error = await submitRecommendationAnswer(qc, 'b', 'understood').catch((e: unknown) => e)
    expect(isRecommendationStale(error)).toBe(true)
    expect(answers()).toEqual({})
    expect(sending()).toEqual({})

    // 패널은 이 오류를 받아 카드를 stale로 바꾼다 (답 버튼이 막힌다)
    const cards = [{ id: 'a' }, { id: 'b' }] as Recommendation[]
    expect(markStale(cards, 'b').map(statusOf)).toEqual(['current', 'stale'])
  })

  it('409가 아닌 실패는 stale로 보지 않는다 (카드가 원래 자리로 돌아오는 기존 동작)', async () => {
    send.mockRejectedValue(new ApiError('INTERNAL', '서버 오류', 500))
    const error = await submitRecommendationAnswer(qc, 'c', 'known').catch((e: unknown) => e)
    expect(isRecommendationStale(error)).toBe(false)
    expect(answers()).toEqual({})
    // 같은 409라도 서버에 닿지 못한 오류(status 0)는 아니다
    expect(isRecommendationStale(new ApiError('NETWORK_ERROR', '연결 안 됨', 0))).toBe(false)
  })

  it('409가 와도 이전에 남긴 답(이해가 안 됨)은 그대로 되돌린다', async () => {
    send.mockResolvedValueOnce(undefined)
    await submitRecommendationAnswer(qc, 'd', 'confused')
    send.mockRejectedValueOnce(new ApiError('INTERNAL', 'stale', 409))
    await submitRecommendationAnswer(qc, 'd', 'understood').catch(() => {})
    expect(answers()).toEqual({ d: 'confused' })
  })
})
