import { request } from './client'
import type { RecommendationFeedback, RecommendationJob } from './types'

// 사용자가 모르는 지식 추천 (docs PR #17 v0.4.0-draft, BE 결정은 docs PR #22). 작업 id를 받고 결과를 polling한다.

/** 페이지의 현재 내용으로 추천 작업을 만든다. 끝나지 않은 작업이 있으면 그 작업을 준다 (202). */
export function requestRecommendationJob(noteId: string): Promise<RecommendationJob> {
  return request('POST', `/notes/${encodeURIComponent(noteId)}/recommendation-jobs`)
}

/**
 * 작업 상태와 결과. completed면 끝났고 outcome으로 끝난 이유를 구분한다 (11/4 결정, BE #74):
 * RECOMMENDED(추천 있음) · NO_RECOMMENDATIONS(추천 없음, 보류 포함) · RECOMMENDATION_FAILED(분석 실패, 시간 초과·취소 포함).
 */
export function getRecommendationJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<RecommendationJob> {
  return request('GET', `/recommendation-jobs/${encodeURIComponent(jobId)}`, { signal })
}

/**
 * 추천 카드의 답 (W3-02 버튼 3개). understood = 이해함, known = 알고 있던 내용, confused = 이해가 안 됨. 204.
 * 같은 답 재전송·confused 뒤 최종 답은 204다. 409는 두 가지다 (docs PR #22):
 * - REVIEW_CONFLICT: 최종 답(understood·known) 뒤 다른 답
 * - RECOMMENDATION_STALE: freshness가 stale·evidence_lost인 추천. 답은 기록되지 않는다
 */
export function sendRecommendationFeedback(
  recommendationId: string,
  action: RecommendationFeedback['action'],
): Promise<void> {
  return request('POST', `/recommendations/${encodeURIComponent(recommendationId)}/feedback`, {
    body: { action },
  })
}
