// 페이지 그래프 (Figma W3-13·W3-13b, GET /graph v0.4.0-draft) 계산. 그리기와 나눠 테스트한다.
import type { Graph, GraphEdge, GraphNode, Topic } from '../../api'
import type { TopicColorKey } from '../../lib/topicColors'

/** 선은 방향이 없다. 두 페이지 id를 정렬해 이어 붙인 값이 선의 id다. */
export function edgeKey(edge: Pick<GraphEdge, 'sourceId' | 'targetId'>): string {
  const [a, b] = [edge.sourceId, edge.targetId].sort()
  return `${a}|${b}`
}

/** 주제 묶음(compound node) id. 미분류는 'none' */
export function groupId(topicId: string | null): string {
  return `topic:${topicId ?? 'none'}`
}

/** 문자열 → 0 이상 1 미만의 고정된 수 (FNV-1a). 같은 id면 열 때마다 같은 값이다. */
export function unitHash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0x100000000
}

const GROUP_GAP = 360
const NODE_SPREAD = 120

/**
 * 배치의 시작 위치 (W3-13: 열 때마다 바뀌지 않게 시작값을 고정한다).
 * 주제 묶음은 주제 순서대로 가로로 놓고, 페이지는 id로 정한 각도·거리에 둔다. 같은 그래프면 늘 같은 값이다.
 */
export function initialPositions(
  nodes: readonly GraphNode[],
  topicOrder: readonly (string | null)[],
): Map<string, { x: number; y: number }> {
  const groupIndex = new Map(topicOrder.map((t, i) => [t, i]))
  const out = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const g = groupIndex.get(n.topicId) ?? topicOrder.length
    const angle = unitHash(n.id) * 2 * Math.PI
    const r = NODE_SPREAD * (0.4 + 0.6 * unitHash(`${n.id}:r`))
    out.set(n.id, { x: g * GROUP_GAP + r * Math.cos(angle), y: r * Math.sin(angle) })
  }
  return out
}

/** 그래프에 나온 주제를 주제 목록 순서로. 미분류는 맨 뒤, 목록에 없는 주제(방금 만든 주제 등)는 그 앞 */
export function topicsInGraph(
  nodes: readonly GraphNode[],
  topics: readonly Topic[],
): (string | null)[] {
  const present = new Set(nodes.map((n) => n.topicId))
  const known = topics.filter((t) => present.has(t.id)).map((t) => t.id)
  const unknown = [...present].filter(
    (id): id is string => id !== null && !topics.some((t) => t.id === id),
  )
  return [...known, ...unknown, ...(present.has(null) ? [null] : [])]
}

export function topicLabel(topics: readonly Topic[], topicId: string | null): string {
  if (topicId === null) return '미분류'
  return topics.find((t) => t.id === topicId)?.name ?? '기타 주제'
}

/** 범례 (W3-13): 그래프에 나온 주제만, 색만으로 구분하지 않게 이름을 함께 */
export function legendEntries(
  nodes: readonly GraphNode[],
  topics: readonly Topic[],
  colorKeys: ReadonlyMap<string, TopicColorKey>,
): { key: TopicColorKey; label: string }[] {
  const out: { key: TopicColorKey; label: string }[] = []
  const seen = new Set<TopicColorKey>()
  for (const topicId of topicsInGraph(nodes, topics)) {
    const key =
      topicId === null ? 'topic-none' : (colorKeys.get(topicId) ?? ('topic-other' as const))
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      key,
      label: key === 'topic-other' ? '기타 주제' : topicLabel(topics, topicId),
    })
  }
  return out
}

/** 고른 선의 카드 내용 (W3-13b). 선이 그래프에서 사라졌으면 null */
export function selectedEdgeInfo(graph: Graph, key: string | null) {
  if (!key) return null
  const edge = graph.edges.find((e) => edgeKey(e) === key)
  if (!edge) return null
  const source = graph.nodes.find((n) => n.id === edge.sourceId)
  const target = graph.nodes.find((n) => n.id === edge.targetId)
  if (!source || !target) return null
  return { source, target, keywords: edge.sharedKeywords ?? [] }
}
