import { request } from './client'
import type { RecommendationJob } from './types'

// 사용자가 모르는 지식 추천 (docs PR #17 v0.4.0-draft). 작업 id를 받고 결과를 polling한다.

/** 페이지의 현재 내용으로 추천 작업을 만든다. 끝나지 않은 작업이 있으면 그 작업을 준다 (202). */
export function requestRecommendationJob(noteId: string): Promise<RecommendationJob> {
  return request('POST', `/notes/${encodeURIComponent(noteId)}/recommendation-jobs`)
}

/** 작업 상태와 결과. completed면 끝났고, 실패·보류·결과 없음도 completed + 빈 배열이다. */
export function getRecommendationJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<RecommendationJob> {
  return request('GET', `/recommendation-jobs/${encodeURIComponent(jobId)}`, { signal })
}
