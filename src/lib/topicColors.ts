import type { GraphNode, Topic } from '../api'

/** 주제 색 칸 수. index.css의 --color-topic-1 … --color-topic-8 */
export const TOPIC_SLOTS = 8

/**
 * 노드 색의 종류. CSS 토큰 이름(--color-<key>)과 같다.
 * - topic-1 … topic-8: 주제 하나
 * - topic-other: 9번째 이후 주제 (새 색을 만들지 않고 "기타"로 묶는다)
 * - topic-none: 미분류
 * - topic-mixed: 근거 노트가 여러 주제에 걸친 개념 (주제를 잇는 매개 개념 후보)
 */
export type TopicColorKey = `topic-${number}` | 'topic-other' | 'topic-none' | 'topic-mixed'

/** 주제 id → 색 칸 번호(1 … TOPIC_SLOTS). 칸이 없는 주제는 빠져 있다 (기타). */
export type TopicSlots = Readonly<Record<string, number>>

/**
 * 주제에 색 칸을 정한다. 이미 칸이 있는 주제는 그 칸을 그대로 둔다 (주제를 지우거나 순서를 바꿔도 다른 주제 색이 바뀌지 않는다).
 * 새 주제(와 아직 칸이 없는 기타 주제)는 만든 순서대로 빈 칸을 받는다. 지운 주제의 칸은 비어 다음 주제가 쓴다.
 */
export function assignTopicSlots(topics: readonly Topic[], previous: TopicSlots): TopicSlots {
  const next: Record<string, number> = {}
  const used = new Set<number>()
  for (const t of topics) {
    const slot = previous[t.id]
    if (Number.isInteger(slot) && slot >= 1 && slot <= TOPIC_SLOTS && !used.has(slot)) {
      next[t.id] = slot
      used.add(slot)
    }
  }
  const waiting = topics
    .filter((t) => !(t.id in next))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  let free = 1
  for (const t of waiting) {
    while (used.has(free)) free++
    if (free > TOPIC_SLOTS) break
    next[t.id] = free
    used.add(free)
  }
  return next
}

/** 주제 → 색 종류. 칸이 없으면 기타 */
export function topicColorKeys(
  topics: readonly Topic[],
  slots: TopicSlots,
): Map<string, TopicColorKey> {
  return new Map(
    topics.map((t) => [t.id, slots[t.id] ? (`topic-${slots[t.id]}` as const) : 'topic-other']),
  )
}

/** 노드의 주제: 근거 노트의 주제가 하나면 그 주제(null은 미분류), 여럿이면 'mixed' */
export function nodeTopicId(node: GraphNode): string | null | 'mixed' {
  const ids = new Set(node.notes.map((n) => n.topicId))
  if (ids.size > 1) return 'mixed'
  return ids.values().next().value ?? null
}

export function nodeColorKey(
  node: GraphNode,
  keys: ReadonlyMap<string, TopicColorKey>,
): TopicColorKey {
  const topicId = nodeTopicId(node)
  if (topicId === 'mixed') return 'topic-mixed'
  if (topicId === null) return 'topic-none'
  // 목록에 아직 없는 주제(방금 만든 주제 등)는 기타로 둔다
  return keys.get(topicId) ?? 'topic-other'
}
