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

/** 보고 있는 카드의 자리. 카드를 id로 기억해, 앞의 카드가 빠지거나 되돌아와도 같은 카드를 보인다. 없으면 0 */
export function currentIndex(list: readonly Recommendation[], currentId: string | null): number {
  const i = currentId === null ? -1 : list.findIndex((r) => r.id === currentId)
  return i < 0 ? 0 : i
}

/** 보고 있는 카드에 답해 카드가 빠지면 볼 카드 (W3-10): 같은 자리에 오는 다음 카드, 마지막이었으면 앞 카드 */
export function cardAfterAnswer(
  list: readonly Recommendation[],
  answeredId: string,
): string | null {
  const i = list.findIndex((r) => r.id === answeredId)
  if (i < 0) return null
  return (list[i + 1] ?? list[i - 1])?.id ?? null
}

/** 답을 보내지 못했을 때 (빠졌던 카드는 원래 자리로 돌아온다) */
export const ANSWER_FAILED_TOAST = '답을 보내지 못했습니다. 카드를 다시 넣었습니다.'
/** '이해가 안 됨'을 보내지 못했을 때. 카드가 빠지지 않았고 챗봇은 그대로 연다 */
export const CONFUSED_FAILED_TOAST = '답을 보내지 못했습니다.'
