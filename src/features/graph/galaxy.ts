// Galaxy 그래프 (FE #44 1단계, Figma W3-22d·e). 단계 이동 상태와 그릴 요소를 만드는 순수 함수.
// - 처음은 최상위 주제만. 주제로 들어가면 하위 주제(큰 원) + 그 주제에 바로 속한 키워드(작은 점). 깊이 제한 없음.
// - 빈 곳을 누르거나 줌 아웃하면 한 단계 위로. 경로(전체 › 네트워크 › …)를 누르면 그 단계로.
import {
  UNASSIGNED_TOPIC_ID,
  type TopicGraph,
  type TopicGraphKeyword,
  type TopicGraphTopic,
} from '../../api'
import type { TopicColorKey } from '../../lib/topicColors'

/**
 * 줌으로 단계를 바꾸는 배율. 단계에 들어와 화면에 맞춘 배율의 이만큼 배로 확대하면 마우스 아래(− + 버튼이면 화면 가운데) 주제로 들어가고,
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

/** 단계를 가리키는 값 (경로 id를 이은 값, 최상위는 'root'). 캔버스가 바뀐 단계를 알아보는 데 쓴다 */
export function levelKeyOf(path: GalaxyPath): string {
  return path.map((s) => s.id).join('/') || 'root'
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

/** 미분류 노드의 이름 (사이드바와 같다) */
export const UNASSIGNED_NAME = '미분류'

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
  // 미분류 노트의 키워드는 topicId가 null이다
  return keywords.filter((k) => (k.topicId ?? UNASSIGNED_TOPIC_ID) === topicId)
}

/**
 * 이 단계에 보일 주제 노드. 최상위에서 미분류 노트의 키워드가 있으면 맨 끝에 "미분류" 노드(topic-none 색)를 더한다.
 * 미분류 키워드가 없으면 노드를 두지 않는다.
 */
export function levelTopics(graph: TopicGraph, path: GalaxyPath): TopicGraphTopic[] {
  // 주제는 id 순 (같은 데이터면 같은 그림), 미분류는 맨 끝
  const topics = [...graph.topics].sort(byId)
  const u = graph.unassigned
  if (path.length > 0 || !u || u.keywordCount <= 0) return topics
  return [
    ...topics,
    {
      id: UNASSIGNED_TOPIC_ID,
      name: UNASSIGNED_NAME,
      keywordCount: u.keywordCount,
      hasChildren: false,
      childTopicCount: 0,
      hasRecommended: u.hasRecommended,
    },
  ]
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

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
  /** 이 단계에 그린 주제 (미분류 노드 포함). 화면이 다시 계산하지 않고 쓴다 */
  topics: TopicGraphTopic[]
  /** 이 단계에 그린 키워드 (바로 속한 것만) */
  keywords: TopicGraphKeyword[]
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
  const colorOf = (id: string): TopicColorKey => {
    const top = colorTopicId(path, id)
    // 미분류는 사이드바·페이지 그래프처럼 topic-none 색
    if (top === UNASSIGNED_TOPIC_ID) return 'topic-none'
    return colorKeys.get(top) ?? 'topic-other'
  }
  const nested = path.length > 0

  const topicList = levelTopics(graph, path)
  const keywordList = directKeywords(graph.keywords, topicId).sort(byId)
  const topics = topicList.map((t) => ({
    data: {
      id: t.id,
      label: `${t.name}\n${topicSubtitle(t, nested)}`,
      kind: 'topic' as const,
      size: topicDiameter(t.keywordCount),
      colorKey: colorOf(t.id),
    },
    classes: ['topic', t.hasRecommended ? 'has-recommended' : ''].filter(Boolean).join(' '),
  }))
  const keywords = keywordList.map((k) => ({
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
  return { nodes: [...topics, ...keywords], edges, topics: topicList, keywords: keywordList }
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

/** 화면(렌더) 또는 그래프(모델) 좌표의 한 점 */
export interface Point {
  x: number
  y: number
}

/** 노드의 그래프(모델) 좌표 상자 */
/** 주제 노드(원)의 그래프 좌표 중심과 반지름 */
export interface Circle {
  x: number
  y: number
  r: number
}

/** 화면 좌표 → 그래프 좌표 (Cytoscape: 화면 = 그래프 × zoom + pan) */
export function renderedToModel(rendered: Point, pan: Point, zoom: number): Point {
  return { x: (rendered.x - pan.x) / zoom, y: (rendered.y - pan.y) / zoom }
}

/**
 * point(그래프 좌표)가 들어 있는 주제. 원 안인지는 중심까지의 거리로 본다 (네모 상자의 빈 모서리는 주제가 아니다).
 * 겹치면 중심에 가장 가까운 주제. 없으면 null
 */
export function topicAt(
  point: Point,
  topics: readonly { id: string; circle: Circle }[],
): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  for (const { id, circle } of topics) {
    const d = Math.hypot(point.x - circle.x, point.y - circle.y)
    if (d <= circle.r && d < bestDistance) {
      best = id
      bestDistance = d
    }
  }
  return best
}

/**
 * 경로의 이름을 받은 데이터로 고친다 (다른 곳에서 주제 이름을 바꿨을 때). 각 칸의 이름은 바로 위 단계의 주제 목록에서 찾는다.
 * levelOf(null)은 최상위, levelOf(id)는 그 주제 안. 아직 받지 않은 단계나 목록에 없는 칸은 그대로 둔다.
 * 바뀐 것이 없으면 같은 배열을 돌려준다.
 */
export function refreshPathNames(
  path: GalaxyPath,
  levelOf: (topicId: string | null) => TopicGraph | undefined,
): GalaxyPath {
  let changed = false
  const next = path.map((step, i) => {
    const parent = levelOf(i === 0 ? null : path[i - 1].id)
    const found = parent && levelTopics(parent, path.slice(0, i)).find((t) => t.id === step.id)
    if (!found || found.name === step.name) return step
    changed = true
    return { id: step.id, name: found.name }
  })
  return changed ? next : path
}

/** 줌 결과 단계를 바꿀지: 주제로 들어가기, 위로, 그대로(null) */
export type ZoomStep = { kind: 'enter'; topicId: string } | { kind: 'up' } | null

/**
 * 줌이 바뀔 때 단계를 바꿀지 정한다 (GALAXY_LEVEL_ZOOM).
 * - 기준(그 단계를 화면에 맞춘 배율)의 GALAXY_LEVEL_ZOOM배 이상: point(그래프 좌표)에 있는 주제로 들어간다. 없으면 그대로(계속 확대).
 *   point는 휠이면 마우스 위치, − + 버튼이면 화면 가운데다. 휠 줌은 마우스 위치를 고정점으로 확대하므로
 *   화면 가운데를 쓰면 가장자리 주제를 가리켜도 그 주제로 들어가지 못한다.
 * - 1/GALAXY_LEVEL_ZOOM배 이하: 위로 (최상위가 아니면)
 */
export function zoomStep(input: {
  zoom: number
  baseZoom: number
  point: Point
  topics: readonly { id: string; circle: Circle }[]
  canGoUp: boolean
}): ZoomStep {
  const { zoom, baseZoom, point, topics, canGoUp } = input
  if (zoom >= baseZoom * GALAXY_LEVEL_ZOOM) {
    const hit = topicAt(point, topics)
    return hit ? { kind: 'enter', topicId: hit } : null
  }
  if (zoom <= baseZoom / GALAXY_LEVEL_ZOOM && canGoUp) return { kind: 'up' }
  return null
}

/** 검색 결과를 고르면 갈 단계 (W3-22g). 키워드면 그 키워드가 바로 속한 주제, 주제면 그 주제 안 */
export function searchTargetPath(result: {
  kind: 'topic' | 'keyword'
  id: string
  name: string
  path: readonly GalaxyStep[]
}): GalaxyPath {
  const parents = result.path.map((s) => ({ id: s.id, name: s.name }))
  return result.kind === 'topic' ? [...parents, { id: result.id, name: result.name }] : parents
}

/** 지금 단계에서 목표 단계로 가는 길 */
export interface GalaxyRoute {
  /** 위로 올라가 멈출 단계 (공통 경로). 지금 단계면 위로 가지 않는다 */
  common: GalaxyPath
  /** 위로 올라갈 단계 수 */
  ups: number
  /** common에서 한 단계씩 들어갈 단계들 (마지막이 목표) */
  downs: GalaxyPath[]
}

/**
 * 지금 경로에서 목표 경로로 가는 길 (11/19 결정). 앞에서부터 같은 칸(id)은 그대로 두고,
 * 필요한 만큼 위로 올라간 뒤(한 번의 화면 전환) 한 단계씩 들어간다.
 * 공통 경로의 이름은 목표 쪽(검색 결과, 더 새 값)을 쓴다.
 */
export function galaxyRoute(from: GalaxyPath, to: GalaxyPath): GalaxyRoute {
  let shared = 0
  while (shared < from.length && shared < to.length && from[shared].id === to[shared].id) shared++
  const common = to.slice(0, shared)
  const downs: GalaxyPath[] = []
  for (let i = shared + 1; i <= to.length; i++) downs.push(to.slice(0, i))
  return { common, ups: from.length - shared, downs }
}

/** 같은 단계인지 (id로만 본다) */
export function samePath(a: GalaxyPath, b: GalaxyPath): boolean {
  return a.length === b.length && a.every((s, i) => s.id === b[i].id)
}

/** 키워드에 도착했을 때 그 노드 쪽으로 확대하는 배율 (지금 배율의 이만큼 배) */
export const GALAXY_ARRIVAL_ZOOM = 1.4
/** 도착 확대는 단계를 바꾸는 배율(GALAXY_LEVEL_ZOOM)의 이만큼까지만 (그 뒤 사용자의 줌이 바로 단계를 바꾸지 않게) */
const ARRIVAL_ZOOM_CEILING = 0.8

/**
 * 키워드 도착 확대 배율. 지금 배율의 GALAXY_ARRIVAL_ZOOM배로 하되, 단계를 화면에 맞춘 배율(baseZoom)의
 * GALAXY_LEVEL_ZOOM × 0.8배를 넘지 않는다 (들어가는 기준보다 늘 작다). 이미 그보다 크면 지금 배율 그대로.
 */
export function arrivalZoom(zoom: number, baseZoom: number): number {
  const ceiling = baseZoom * GALAXY_LEVEL_ZOOM * ARRIVAL_ZOOM_CEILING
  return Math.max(zoom, Math.min(zoom * GALAXY_ARRIVAL_ZOOM, ceiling))
}

/** 검색 결과의 둘째 줄: "키워드 ◆ · 전체 › 네트워크" (W3-22g). 미분류 키워드는 "전체 › 미분류" */
export function searchResultMeta(r: {
  kind: 'topic' | 'keyword'
  origin: 'extracted' | 'generated'
  path: readonly GalaxyStep[]
}): string {
  const kind = r.kind === 'topic' ? '주제' : r.origin === 'generated' ? '키워드 ◆' : '키워드'
  const names = r.path.map((s) => (s.id === UNASSIGNED_TOPIC_ID ? UNASSIGNED_NAME : s.name))
  return `${kind} · ${['전체', ...names].join(' › ')}`
}

/** 검색창에서 누른 키로 할 일 */
export type SearchKeyAction =
  | { kind: 'open' }
  | { kind: 'move'; active: number }
  | { kind: 'choose'; index: number }
  | { kind: 'close' }
  | null

/**
 * 검색창 키보드 (W3-22g): ↓↑는 목록을 열거나 결과를 옮기고(끝에서 처음으로 돈다), Enter는 고른 결과로 가고, Esc는 목록을 닫는다.
 * active는 지금 고른 결과 자리(없으면 −1), count는 결과 수. 할 일이 없으면 null (입력에 그대로 맡긴다)
 */
export function searchKeyAction(
  key: string,
  state: { open: boolean; active: number; count: number },
): SearchKeyAction {
  const { open, active, count } = state
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (!open) return { kind: 'open' }
    if (count === 0) return null
    const step = key === 'ArrowDown' ? 1 : -1
    return { kind: 'move', active: (Math.max(active, 0) + step + count) % count }
  }
  if (key === 'Enter')
    return open && active >= 0 && active < count ? { kind: 'choose', index: active } : null
  if (key === 'Escape') return open ? { kind: 'close' } : null
  return null
}
