import type { Recommendation } from '../api'

/** 추천 카드의 답 (Figma W3-02 버튼 3개, POST /recommendations/{id}/feedback의 action) */
export type RecommendationAnswer = 'understood' | 'known' | 'confused'

/**
 * 패널에 남는 추천 (W3-10·11). '이해함'·'알고 있던 내용'으로 답하면 빠지고 다음 카드로 넘어간다.
 * '이해가 안 됨'은 챗봇으로 넘어갈 뿐 답이 끝난 것이 아니라 남긴다. 순서는 받은 목록 그대로다.
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

/** '이해함'·'알고 있던 내용'으로 답한 카드. 목록에 다시 넣지 않는다 ('이해가 안 됨'은 남는다) */
function isDone(answer: RecommendationAnswer | undefined): boolean {
  return answer !== undefined && answer !== 'confused'
}

/** 패널에 한 번에 보이는 카드 수 (11/04 회의). 나머지는 대기 목록에서 차례를 기다린다 */
export const MAX_VISIBLE_RECOMMENDATIONS = 5

/**
 * 쌓인 카드를 보이는 카드와 대기 카드로 나눈다 (W3-09, 11/04 회의).
 * 답한 카드를 뺀 뒤 앞 5장이 보이고, 나머지는 대기한다. 답해서 카드가 빠지면 대기 카드가 차례로 끝에 붙는다.
 * 답을 보내지 못해 답이 되돌려지면 그 카드는 원래 자리로 돌아온다.
 */
export function splitRecommendations(
  cards: readonly Recommendation[],
  answers: Readonly<Record<string, RecommendationAnswer>>,
): { visible: Recommendation[]; waiting: Recommendation[] } {
  const remaining = remainingRecommendations(cards, answers)
  return {
    visible: remaining.slice(0, MAX_VISIBLE_RECOMMENDATIONS),
    waiting: remaining.slice(MAX_VISIBLE_RECOMMENDATIONS),
  }
}

/**
 * 새 추천 작업이 끝났을 때 쌓인 카드와 새 결과를 합친다 (11/04 회의).
 * - 앞부분 고정: 보고 있는 카드와 그 앞(이미 넘겨 본 카드)은 자리와 순서를 그대로 둔다.
 *   같은 id가 새 결과에 있으면 내용(결론·근거 등)만 새 것으로 바꾸고, 없어도 남긴다.
 * - 뒤쪽: 나머지는 새 결과의 BE 순서(점수 순)대로 다시 채운다. 답이 확정된 카드('이해가 안 됨' 제외)는 넣지 않는다.
 *   그래서 새 결과에 없는 뒤쪽 카드는 빠진다. 같은 추천은 BE가 같은 id로 주므로 id로 중복을 거른다.
 * - 전송 중인 답(sending)의 카드는 확정되지 않았으므로 원래 자리에 남긴다 (화면에서는 답으로 숨긴다).
 *   고정 구간 안에 있으면 그 자리에, 보고 있는 카드 뒤에 있었으면 바로 뒤에 둔다. 전송이 실패해 답이 되돌려지면
 *   그 자리에 다시 보이고("카드를 다시 넣었습니다"), 성공하면 removeRecommendation으로 뺀다.
 * cards는 쌓인 카드 전체(보이는 카드 + 대기 카드)다. 결과에서 보이는 카드는 splitRecommendations로 나눈다.
 * added는 이전 목록(대기 포함)에 없던 id 수다 ("새 추천 N개").
 */
export function mergeRecommendations(
  cards: readonly Recommendation[],
  currentId: string | null,
  incoming: readonly Recommendation[],
  answers: Readonly<Record<string, RecommendationAnswer>>,
  sending: ReadonlySet<string> = new Set(),
): { cards: Recommendation[]; added: number } {
  const confirmed = (id: string) => isDone(answers[id]) && !sending.has(id)
  const fresh = new Map(incoming.map((r) => [r.id, r]))
  const latest = (r: Recommendation) => fresh.get(r.id) ?? r
  // 보고 있는 카드는 보이는 카드여야 한다. 고정 구간은 쌓인 카드에서 그 카드까지 (숨긴 전송 중 카드 포함)
  const viewing = splitRecommendations(cards, answers).visible.some((r) => r.id === currentId)
  const end = viewing ? cards.findIndex((r) => r.id === currentId) + 1 : 0

  const out: Recommendation[] = []
  const ids = new Set<string>()
  const push = (r: Recommendation) => {
    if (ids.has(r.id)) return
    ids.add(r.id)
    out.push(latest(r))
  }
  for (const r of cards.slice(0, end)) if (!confirmed(r.id)) push(r)
  for (const r of cards.slice(end)) if (sending.has(r.id)) push(r)
  for (const r of incoming) if (!confirmed(r.id)) push(r)
  const before = new Set(cards.map((r) => r.id))
  return { cards: out, added: out.filter((r) => !before.has(r.id)).length }
}

/** 답 전송이 성공해 확정된 카드를 쌓인 카드에서 뺀다 */
export function removeRecommendation(
  cards: readonly Recommendation[],
  id: string,
): Recommendation[] {
  return cards.filter((r) => r.id !== id)
}

/** 새 카드가 들어왔을 때 알림 (11/04 회의) */
export function newRecommendationsToast(count: number): string {
  return `새 추천 ${count}개`
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

/**
 * 보고 있는 카드에 답해 카드가 빠지면 볼 카드 (W3-10): 같은 자리에 오는 다음 카드, 마지막이었으면 앞 카드.
 * list에 대기 카드까지 넘기면, 보이는 카드의 마지막에 답했을 때 그 자리에 붙는 대기 카드를 본다.
 */
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
