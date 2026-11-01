import type { Recommendation } from '../api'

/** 추천 카드의 답 (Figma W3-02 버튼 3개, POST /recommendations/{id}/feedback의 action) */
export type RecommendationAnswer = 'understood' | 'known' | 'confused'

/**
 * 패널에 남는 추천 (W3-10·11). '이해함'·'알고 있던 내용'으로 답하면 빠지고 다음 카드로 넘어간다.
 * '이해가 안 됨'은 챗봇으로 넘어갈 뿐 답이 끝난 것이 아니라 남긴다. 순서는 BE가 준 그대로다.
 */
export function remainingRecommendations(
  list: readonly Recommendation[],
  answers: Readonly<Record<string, RecommendationAnswer>>,
): Recommendation[] {
  return list.filter((r) => {
    const a = answers[r.id]
    return a === undefined || a === 'confused'
  })
}

/** 답한 뒤 알림 (W3-10·11). '이해가 안 됨'은 챗봇으로 넘어가 알리지 않는다 */
export const ANSWER_TOAST: Partial<Record<RecommendationAnswer, string>> = {
  understood: "'이해함'으로 남겼습니다. 지식 그래프에 반영합니다.",
  known: "'알고 있던 내용'으로 남겼습니다.",
}
