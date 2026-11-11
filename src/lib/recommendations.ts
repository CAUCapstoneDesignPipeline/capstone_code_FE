import type { Recommendation, RecommendationStatus } from '../api'

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
 * 보이는 카드 중 보고 있는 카드의 자리 (W3-09·10).
 * 보고 있는 카드가 대기 카드에 있으면(마지막 카드에 답해 대기 카드로 넘어갔는데 전송이 실패해 답한 카드가 돌아온 경우)
 * 보이는 카드의 마지막, 곧 제자리로 돌아온 카드를 본다. 어디에도 없으면 첫 카드(0).
 */
export function viewingIndex(
  visible: readonly Recommendation[],
  waiting: readonly Recommendation[],
  currentId: string | null,
): number {
  const i = currentId === null ? -1 : visible.findIndex((r) => r.id === currentId)
  if (i >= 0) return i
  if (currentId !== null && waiting.some((r) => r.id === currentId)) return visible.length - 1
  return 0
}

/** 추천 카드의 상태. 계약 반영 전 가정 필드라 없으면 current로 본다 */
export function statusOf(r: Recommendation): RecommendationStatus {
  return r.status ?? 'current'
}

/** 추천의 revision. 계약 반영 전 가정 필드라 없으면 0으로 본다 */
export function revisionOf(r: Recommendation): number {
  return r.revision ?? 0
}

/** 답할 수 있는 카드인지. stale·evidence_lost는 목록에 남기되 버튼을 막는다 (11/04 회의) */
export function isAnswerable(r: Recommendation): boolean {
  return statusOf(r) === 'current'
}

/**
 * 쌓인 카드와 같은 id로 새로 온 추천을 맞춘다 (11/04 회의).
 * - 새 결과가 stale·evidence_lost: 내용은 그대로 두고 상태만 바꾼다.
 * - 새 결과가 current이고 revision이 더 크다: 근거만 바뀌고 여전히 성립한다. 내용을 바꾸고 current로 되돌린다 (refreshed).
 * - 새 결과가 current이고 revision이 같거나 작다: 내 카드가 이미 막혀 있으면(stale·evidence_lost, 409로 막은 것 포함)
 *   새 revision이 올 때까지 그대로 둔다. 막혀 있지 않으면 내용만 새 것으로 바꾼다 (2번 작업의 규칙).
 */
function reconcile(
  old: Recommendation,
  next: Recommendation | undefined,
): { card: Recommendation; refreshed: boolean } {
  if (!next) return { card: old, refreshed: false }
  const status = statusOf(next)
  if (status !== 'current') return { card: { ...old, status }, refreshed: false }
  if (revisionOf(next) > revisionOf(old)) return { card: next, refreshed: true }
  if (!isAnswerable(old)) return { card: old, refreshed: false }
  return { card: next, refreshed: false }
}

/**
 * 새 추천 작업이 끝났을 때 쌓인 카드와 새 결과를 합친다 (11/04 회의).
 * - 앞부분 고정: 보고 있는 카드와 그 앞(이미 넘겨 본 카드)은 자리와 순서를 그대로 둔다.
 *   같은 id가 새 결과에 있으면 내용(결론·근거 등)만 새 것으로 바꾸고, 없어도 남긴다.
 *   보고 있는 카드는 currentId로 viewingIndex처럼 정한다 (정하지 않았으면 첫 카드).
 * - 뒤쪽: 나머지는 새 결과의 BE 순서(점수 순)대로 다시 채운다. 답이 확정된 카드('이해가 안 됨' 제외)는 넣지 않는다.
 *   그래서 새 결과에 없는 뒤쪽 카드는 빠진다. 같은 추천은 BE가 같은 id로 주므로 id로 중복을 거른다.
 * - 같은 id의 카드는 상태·revision 규칙(reconcile)으로 맞춘다. 고정된 카드도 같다. 자리는 바꾸지 않는다.
 *   처음 보는 id인데 stale·evidence_lost로 온 추천은 답할 수 없으므로 넣지 않는다.
 * - 전송 중인 답(sending)의 카드는 확정되지 않았으므로 원래 자리에 남긴다 (화면에서는 답으로 숨긴다).
 *   고정 구간 안에 있으면 그 자리에, 보고 있는 카드 뒤에 있었으면 바로 뒤에 둔다. 전송이 실패해 답이 되돌려지면
 *   그 자리에 다시 보이고("카드를 다시 넣었습니다"), 성공하면 removeRecommendation으로 뺀다.
 * cards는 쌓인 카드 전체(보이는 카드 + 대기 카드)다. 결과에서 보이는 카드는 splitRecommendations로 나눈다.
 * 돌려주는 값:
 * - currentId: 합친 뒤 보고 있는 카드 (카드가 없으면 null)
 * - added: 이전 목록(대기 포함)에 없던 id 수 ("새 추천 N개")
 * - offered: 이번에 다룬 추천 수 (답이 확정돼 넣지 않은 카드 포함). 0보다 크면 카드가 다 빠졌을 때 "모두 확인함"(W3-11)이다
 * - refreshed: 새 revision으로 내용을 바꾼 카드 수 ("내용이 갱신되었습니다")
 */
export function mergeRecommendations(
  cards: readonly Recommendation[],
  currentId: string | null,
  incoming: readonly Recommendation[],
  answers: Readonly<Record<string, RecommendationAnswer>>,
  sending: ReadonlySet<string> = new Set(),
): {
  cards: Recommendation[]
  currentId: string | null
  added: number
  offered: number
  refreshed: number
} {
  const confirmed = (id: string) => isDone(answers[id]) && !sending.has(id)
  const fresh = new Map(incoming.map((r) => [r.id, r]))
  const old = new Map(cards.map((r) => [r.id, r]))
  let refreshed = 0
  const { visible, waiting } = splitRecommendations(cards, answers)
  const viewing = visible[viewingIndex(visible, waiting, currentId)]?.id ?? null
  // 고정 구간은 쌓인 카드에서 보고 있는 카드까지 (숨긴 전송 중 카드 포함)
  const end = viewing === null ? 0 : cards.findIndex((r) => r.id === viewing) + 1

  const out: Recommendation[] = []
  const ids = new Set<string>()
  const push = (r: Recommendation) => {
    if (ids.has(r.id)) return
    const mine = old.get(r.id)
    // 처음 보는 추천이 이미 막혀 있으면 넣지 않는다
    if (!mine && !isAnswerable(r)) return
    ids.add(r.id)
    if (!mine) return void out.push(r)
    const next = reconcile(mine, fresh.get(r.id))
    if (next.refreshed) refreshed++
    out.push(next.card)
  }
  for (const r of cards.slice(0, end)) if (!confirmed(r.id)) push(r)
  for (const r of cards.slice(end)) if (sending.has(r.id)) push(r)
  for (const r of incoming) if (!confirmed(r.id)) push(r)
  return {
    cards: out,
    currentId: viewing ?? out[0]?.id ?? null,
    added: out.filter((r) => !old.has(r.id)).length,
    offered: new Set([...ids, ...fresh.keys()]).size,
    refreshed,
  }
}

/** 답 전송이 성공해 확정된 카드를 쌓인 카드에서 뺀다 */
export function removeRecommendation(
  cards: readonly Recommendation[],
  id: string,
): Recommendation[] {
  return cards.filter((r) => r.id !== id)
}

/**
 * 보고 있던 카드에서 이전·다음으로 다른 카드로 갈 때 (11/04 회의).
 * 떠나는 카드가 stale·evidence_lost이면 목록에서 뺀다. 빈 자리는 대기 카드가 채운다 (splitRecommendations).
 * 새 revision이 와서 current로 돌아온 카드는 빼지 않는다.
 */
export function leaveRecommendation(
  cards: readonly Recommendation[],
  leavingId: string,
): Recommendation[] {
  const leaving = cards.find((r) => r.id === leavingId)
  return leaving && !isAnswerable(leaving) ? removeRecommendation(cards, leavingId) : [...cards]
}

/** 답이 409로 막혔을 때: 그 카드를 stale로 바꾼다. 내용과 자리는 그대로다 */
export function markStale(cards: readonly Recommendation[], id: string): Recommendation[] {
  return cards.map((r) => (r.id === id ? { ...r, status: 'stale' } : r))
}

/** 새 카드가 들어왔을 때 알림 (11/04 회의) */
export function newRecommendationsToast(count: number): string {
  return `새 추천 ${count}개`
}

/** 새 revision으로 카드 내용이 바뀌었을 때 알림 (11/04 회의) */
export const REFRESHED_TOAST = '내용이 갱신되었습니다'

/**
 * 합친 뒤 알림. 알림은 한 번에 하나만 보이므로 새 추천과 내용 갱신을 한 문장으로 합친다. 알릴 것이 없으면 null
 */
export function mergeToast(added: number, refreshed: number): string | null {
  const parts = [
    ...(added > 0 ? [newRecommendationsToast(added)] : []),
    ...(refreshed > 0 ? [REFRESHED_TOAST] : []),
  ]
  return parts.length > 0 ? parts.join(' · ') : null
}

/** 답이 409로 막혔을 때 (근거가 바뀐 추천) */
export const STALE_ANSWER_TOAST = '근거가 바뀌어 답할 수 없습니다'

/** 카드 위에 보이는 상태 (11/04 회의). current면 없다 */
export const STATUS_NOTICE: Partial<
  Record<RecommendationStatus, { title: string; description: string }>
> = {
  stale: {
    title: '근거가 바뀌었습니다',
    description:
      '다시 분석한 뒤 이 추천의 근거가 달라져 답할 수 없습니다. 다른 카드로 넘어가면 목록에서 빠집니다.',
  },
  evidence_lost: {
    title: '근거 문장이 삭제되었습니다',
    description:
      '근거 문장이 노트에서 지워져 답할 수 없습니다. 다른 카드로 넘어가면 목록에서 빠집니다.',
  },
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
