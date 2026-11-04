// 페이지 그래프 (Figma W3-13·W3-13b, GET /graph v0.4.0-draft) 계산. 그리기와 나눠 테스트한다.
import type { Graph, GraphEdge, GraphNode, Topic } from '../../api'
import type { TopicColorKey } from '../../lib/topicColors'

/** 선은 방향이 없다. 두 페이지 id를 정렬해 이어 붙인 값이 선의 id다. */
export function edgeKey(edge: Pick<GraphEdge, 'sourceId' | 'targetId'>): string {
  const [a, b] = [edge.sourceId, edge.targetId].sort()
  return `${a}|${b}`
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

/** 페이지 하나가 차지하는 시작 넓이의 기준. 페이지가 많을수록 시작 원이 커진다 */
const NODE_SPREAD = 120

/**
 * 배치의 시작 위치 (W3-13: 열 때마다 바뀌지 않게 시작값을 고정한다).
 * 모든 페이지를 한 원 안에 id로 정한 각도·거리로 둔다. 원의 반지름은 페이지 수의 제곱근에 비례한다.
 * 노드 순서와 주제에 관계없이 id만 보므로 같은 그래프면 늘 같은 값이다.
 */
export function initialPositions(
  nodes: readonly GraphNode[],
): Map<string, { x: number; y: number }> {
  const radius = NODE_SPREAD * Math.sqrt(nodes.length)
  const out = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const angle = unitHash(n.id) * 2 * Math.PI
    // 제곱근을 써서 원 안에 고르게 퍼지게 한다 (가운데로 몰리지 않게)
    const r = radius * Math.sqrt(unitHash(`${n.id}:r`))
    out.set(n.id, { x: r * Math.cos(angle), y: r * Math.sin(angle) })
  }
  return out
}

/**
 * id 순으로 정렬한 사본. 그래프에 넣는 순서를 고정한다 (fcose는 연결 없는 페이지를 넣은 순서대로 타일링하므로,
 * 응답의 노드 순서가 바뀌어도 같은 그림이 나오게 한다).
 */
export function sortedById<T>(items: readonly T[], idOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const x = idOf(a)
    const y = idOf(b)
    return x < y ? -1 : x > y ? 1 : 0
  })
}

/** 페이지 알약이 차지하는 상자 (가운데 x·y 기준) */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** 두 페이지 사이에 두는 최소 여백 */
const BOX_MARGIN = 8

/** 두 상자가 겹치는지 (여백 포함) */
export function overlaps(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + BOX_MARGIN &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + BOX_MARGIN
  )
}

/**
 * 새 페이지를 둘 자리. 먼저 center에서 gap만큼 angle 방향(지금까지의 자리)을 쓰고, 다른 페이지(taken)와 겹치면
 * 같은 고리의 다른 각도, 그다음 바깥 고리 순으로 빈자리를 찾는다. 끝까지 못 찾으면 첫 자리를 쓴다.
 * 그래서 연결 없는 페이지를 여러 번에 걸쳐 더해도 화면 가운데에 겹쳐 쌓이지 않는다.
 */
export function placeNear(
  center: { x: number; y: number },
  angle: number,
  size: { width: number; height: number },
  taken: readonly Box[],
  gap: number,
  rings = 6,
  steps = 12,
): { x: number; y: number } {
  for (let ring = 1; ring <= rings; ring++) {
    for (let k = 0; k < steps; k++) {
      const a = angle + (k * 2 * Math.PI) / steps
      const p = { x: center.x + ring * gap * Math.cos(a), y: center.y + ring * gap * Math.sin(a) }
      if (!taken.some((t) => overlaps({ ...p, ...size }, t))) return p
    }
  }
  return { x: center.x + gap * Math.cos(angle), y: center.y + gap * Math.sin(angle) }
}

/** 그래프에 나온 주제를 주제 목록 순서로 (범례 순서). 미분류는 맨 뒤, 목록에 없는 주제(방금 만든 주제 등)는 그 앞 */
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
