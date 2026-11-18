// Galaxy 그래프 (FE #44 1단계, Figma W3-22d·e). 단계 이동 상태와 그릴 요소를 만드는 순수 함수.
// - 처음은 최상위 주제만. 주제로 들어가면 하위 주제(큰 원) + 그 주제에 바로 속한 키워드(작은 점). 깊이 제한 없음.
// - 빈 곳을 누르거나 줌 아웃하면 한 단계 위로. 경로(전체 › 네트워크 › …)를 누르면 그 단계로.
import type { TopicGraph, TopicGraphKeyword, TopicGraphTopic } from '../../api'
import type { TopicColorKey } from '../../lib/topicColors'

/**
 * 줌으로 단계를 바꾸는 배율. 단계에 들어와 화면에 맞춘 배율의 이만큼 배로 확대하면 가운데 주제로 들어가고,
 * 이만큼 분의 1로 축소하면 한 단계 위로 간다. 미정(11/18 회의) — 실측 후 조정한다.
 */
export const GALAXY_LEVEL_ZOOM = 1.8

/** 경로의 한 칸 */
export interface GalaxyStep {
  id: string
  name: string
}

/** 지금 단계. 빈 배열이면 최상위(전체) */
export type GalaxyPath = readonly GalaxyStep[]

export const ROOT: GalaxyPath = []

/** 지금 보고 있는 주제 id. 최상위면 null */
export function currentTopicId(path: GalaxyPath): string | null {
  return path.length === 0 ? null : path[path.length - 1].id
}

/** 하위 주제로 들어간다 */
export function enter(path: GalaxyPath, topic: GalaxyStep): GalaxyPath {
  return [...path, { id: topic.id, name: topic.name }]
}

/** 한 단계 위로. 최상위면 그대로 (같은 배열) */
export function up(path: GalaxyPath): GalaxyPath {
  return path.length === 0 ? path : path.slice(0, -1)
}

/** 경로의 i번째 칸으로 (−1 = 전체). 범위를 벗어나면 그대로 */
export function goTo(path: GalaxyPath, index: number): GalaxyPath {
  if (index < -1 || index >= path.length - 1) return path
  return path.slice(0, index + 1)
}

/** 주제 색을 정하는 최상위 주제 id. 최상위 단계면 그 노드 자신 */
export function colorTopicId(path: GalaxyPath, topicId: string): string {
  return path.length === 0 ? topicId : path[0].id
}

/**
 * 이 주제에 바로 속한 키워드만 (하위 주제의 키워드는 보이지 않는다, 11/18 회의).
 * 최상위에는 키워드가 없다. BE가 하위 주제의 키워드까지 주더라도 여기서 거른다.
 */
export function directKeywords(
  keywords: readonly TopicGraphKeyword[],
  topicId: string | null,
): TopicGraphKeyword[] {
  if (topicId === null) return []
  return keywords.filter((k) => k.topicId === topicId)
}

/** 추천으로 들어온 지식인지 (◆ 모양 + recommended 색) */
export const isRecommendedKeyword = (k: TopicGraphKeyword) => k.origin === 'generated'

/** 주제 노드 지름: 키워드 수에 따라 (W3-22d: 키워드 3 → 112, 4 → 184 정도) */
const TOPIC_MIN = 96
const TOPIC_MAX = 184
const TOPIC_PER_KEYWORD = 12
export function topicDiameter(keywordCount: number): number {
  return Math.min(TOPIC_MAX, TOPIC_MIN + Math.max(0, keywordCount) * TOPIC_PER_KEYWORD)
}

/** 키워드 점 지름: 개념(설명) 수에 따라 (W3-22e: 20~36) */
const KEYWORD_MIN = 18
const KEYWORD_MAX = 40
const KEYWORD_PER_CONCEPT = 4
export function keywordDiameter(conceptCount: number): number {
  return Math.min(KEYWORD_MAX, KEYWORD_MIN + Math.max(0, conceptCount) * KEYWORD_PER_CONCEPT)
}

/** 주제 노드의 둘째 줄 (W3-22d·e "하위 주제 2 · 키워드 4"). 하위 주제가 없으면 키워드만 */
export function topicSubtitle(t: TopicGraphTopic, nested: boolean): string {
  const parts: string[] = []
  if (t.childTopicCount > 0) parts.push(`하위 주제 ${t.childTopicCount}`)
  else if (nested) parts.push('하위 주제')
  parts.push(`키워드 ${t.keywordCount}`)
  return parts.join(' · ')
}

/** 상단 막대의 요약 (W3-22d "최상위 주제 4", W3-22e "하위 주제 2 · 키워드 4") */
export function levelSummary(path: GalaxyPath, topics: number, keywords: number): string {
  if (path.length === 0) return `최상위 주제 ${topics}`
  return `하위 주제 ${topics} · 키워드 ${keywords}`
}

export interface GalaxyNodeData {
  id: string
  label: string
  kind: 'topic' | 'keyword'
  size: number
  colorKey: TopicColorKey
}

export interface GalaxyElements {
  nodes: { data: GalaxyNodeData; classes: string }[]
  edges: { data: { id: string; source: string; target: string } }[]
}

/**
 * 한 단계에 그릴 Cytoscape 요소. 주제는 큰 원(키워드 수 크기), 키워드는 작은 점(개념 수 크기).
 * 추천 지식 키워드는 'recommended'(◆), 안에 추천 지식이 있는 주제는 'has-recommended'(작은 점).
 * 색은 최상위 주제 기준. 양 끝이 이 단계에 없는 선은 뺀다. id 순으로 넣어 같은 데이터면 같은 그림이 나온다.
 */
export function galaxyElements(
  graph: TopicGraph,
  path: GalaxyPath,
  colorKeys: ReadonlyMap<string, TopicColorKey>,
): GalaxyElements {
  const topicId = currentTopicId(path)
  const colorOf = (id: string): TopicColorKey =>
    colorKeys.get(colorTopicId(path, id)) ?? 'topic-other'
  const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const nested = path.length > 0

  const topics = [...graph.topics].sort(byId).map((t) => ({
    data: {
      id: t.id,
      label: `${t.name}\n${topicSubtitle(t, nested)}`,
      kind: 'topic' as const,
      size: topicDiameter(t.keywordCount),
      colorKey: colorOf(t.id),
    },
    classes: ['topic', t.hasRecommended ? 'has-recommended' : ''].filter(Boolean).join(' '),
  }))
  const keywords = directKeywords(graph.keywords, topicId)
    .sort(byId)
    .map((k) => ({
      data: {
        id: k.id,
        label: k.label,
        kind: 'keyword' as const,
        size: keywordDiameter(k.conceptCount),
        colorKey: colorOf(k.id),
      },
      classes: ['keyword', isRecommendedKeyword(k) ? 'recommended' : ''].filter(Boolean).join(' '),
    }))

  const ids = new Set([...topics, ...keywords].map((n) => n.data.id))
  const seen = new Set<string>()
  const edges: GalaxyElements['edges'] = []
  for (const e of graph.edges) {
    if (!ids.has(e.sourceId) || !ids.has(e.targetId) || e.sourceId === e.targetId) continue
    const [a, b] = e.sourceId < e.targetId ? [e.sourceId, e.targetId] : [e.targetId, e.sourceId]
    const id = `${a}|${b}`
    if (seen.has(id)) continue
    seen.add(id)
    edges.push({ data: { id, source: a, target: b } })
  }
  edges.sort((x, y) => (x.data.id < y.data.id ? -1 : 1))
  return { nodes: [...topics, ...keywords], edges }
}

/** 키워드를 눌렀을 때 보일 정보 (W3-20d 팝업). 이 단계에 없으면 null */
export function keywordDocs(
  graph: TopicGraph,
  path: GalaxyPath,
  keywordId: string | null,
): TopicGraphKeyword | null {
  if (keywordId === null) return null
  return (
    directKeywords(graph.keywords, currentTopicId(path)).find((k) => k.id === keywordId) ?? null
  )
}
