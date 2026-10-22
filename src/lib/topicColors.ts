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

/** 주제 → 색 칸. 만든 순서로 정해 두어 주제 순서를 바꾸거나 걸러도 색이 바뀌지 않는다. */
export function topicColorKeys(topics: readonly Topic[]): Map<string, TopicColorKey> {
  const byCreation = [...topics].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
  return new Map(
    byCreation.map((t, i) => [t.id, i < TOPIC_SLOTS ? `topic-${i + 1}` : 'topic-other']),
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
