import { describe, expect, it } from 'vitest'
import type { TopicGraph, TopicGraphKeyword, TopicGraphTopic } from '../../api'
import type { TopicColorKey } from '../../lib/topicColors'
import {
  refreshPathNames,
  topicAt,
  GALAXY_LEVEL_ZOOM,
  levelTopics,
  renderedToModel,
  zoomStep,
  colorTopicId,
  currentTopicId,
  directKeywords,
  enter,
  galaxyElements,
  goTo,
  keywordDiameter,
  keywordDocs,
  levelSummary,
  ROOT,
  topicDiameter,
  topicSubtitle,
  up,
} from './galaxy'

const topic = (id: string, over: Partial<TopicGraphTopic> = {}): TopicGraphTopic => ({
  id,
  name: id,
  keywordCount: 2,
  hasChildren: false,
  childTopicCount: 0,
  hasRecommended: false,
  ...over,
})

const keyword = (id: string, topicId: string, over: Partial<TopicGraphKeyword> = {}) =>
  ({
    id,
    label: id,
    conceptCount: 1,
    origin: 'extracted',
    topicId,
    documents: [{ noteId: `note-${id}`, title: `${id} 노트` }],
    ...over,
  }) satisfies TopicGraphKeyword

const net = { id: 'net', name: '네트워크' }
const transport = { id: 'transport', name: '전송 계층' }
const congestion = { id: 'congestion', name: '혼잡 제어' }

describe('단계 이동 (11/18 회의)', () => {
  it('들어가기: 경로 끝에 주제가 붙고, 지금 주제가 된다', () => {
    const p1 = enter(ROOT, net)
    const p2 = enter(p1, transport)
    const p3 = enter(p2, congestion)
    expect(p3).toEqual([net, transport, congestion])
    expect(currentTopicId(ROOT)).toBeNull()
    expect(currentTopicId(p3)).toBe('congestion')
  })

  it('들어가기는 이름과 id만 기억한다 (노드의 다른 값은 버린다)', () => {
    expect(enter(ROOT, topic('net', { name: '네트워크' }))).toEqual([net])
  })

  it('나오기: 한 단계 위로, 최상위면 그대로', () => {
    expect(up([net, transport])).toEqual([net])
    expect(up([net])).toEqual([])
    expect(up(ROOT)).toBe(ROOT)
  })

  it('경로 이동: i번째 칸으로 (−1 = 전체), 지금 칸이나 범위 밖이면 그대로', () => {
    const path = [net, transport, congestion]
    expect(goTo(path, -1)).toEqual([])
    expect(goTo(path, 0)).toEqual([net])
    expect(goTo(path, 1)).toEqual([net, transport])
    expect(goTo(path, 2)).toBe(path)
    expect(goTo(path, 5)).toBe(path)
    expect(goTo(path, -2)).toBe(path)
  })

  it('색은 최상위 주제 기준: 최상위 단계는 노드 자신, 안에서는 경로의 첫 주제', () => {
    expect(colorTopicId(ROOT, 'db')).toBe('db')
    expect(colorTopicId([net, transport], 'anything')).toBe('net')
  })
})

describe('바로 속한 키워드만', () => {
  const keywords = [
    keyword('idem', 'net'),
    keyword('tcp', 'transport'),
    keyword('cwnd', 'congestion'),
  ]

  it('지금 주제에 바로 속한 키워드만 고른다 (하위 주제의 키워드는 빼고)', () => {
    expect(directKeywords(keywords, 'net').map((k) => k.id)).toEqual(['idem'])
    expect(directKeywords(keywords, 'transport').map((k) => k.id)).toEqual(['tcp'])
  })

  it('최상위에는 키워드가 없다', () => {
    expect(directKeywords(keywords, null)).toEqual([])
  })
})

describe('그릴 요소', () => {
  const colors = new Map<string, TopicColorKey>([
    ['net', 'topic-1'],
    ['db', 'topic-2'],
  ])

  it('최상위: 주제만, 색은 그 주제, 크기는 키워드 수, 안에 추천 지식이 있으면 점 표시', () => {
    const graph: TopicGraph = {
      topics: [
        topic('net', { keywordCount: 12, childTopicCount: 2, hasRecommended: true }),
        topic('db', { keywordCount: 0 }),
      ],
      keywords: [],
      edges: [{ sourceId: 'net', targetId: 'db' }],
    }
    const { nodes, edges } = galaxyElements(graph, ROOT, colors)
    expect(nodes.map((n) => [n.data.id, n.data.colorKey, n.classes])).toEqual([
      ['db', 'topic-2', 'topic'],
      ['net', 'topic-1', 'topic has-recommended'],
    ])
    expect(nodes.find((n) => n.data.id === 'net')?.data.size).toBe(topicDiameter(12))
    expect(nodes.find((n) => n.data.id === 'net')?.data.label).toBe('net\n하위 주제 2 · 키워드 12')
    expect(edges).toEqual([{ data: { id: 'db|net', source: 'db', target: 'net' } }])
  })

  it('주제 안: 하위 주제 + 바로 속한 키워드. 추천 지식 키워드는 recommended(◆), 색은 최상위 주제', () => {
    const graph: TopicGraph = {
      topics: [topic('transport', { hasRecommended: true })],
      keywords: [
        keyword('idem', 'net', { conceptCount: 3 }),
        keyword('write', 'net', { origin: 'generated' }),
        // BE가 하위 주제의 키워드를 섞어 줘도 그리지 않는다
        keyword('tcp', 'transport'),
      ],
      edges: [
        { sourceId: 'idem', targetId: 'write' },
        { sourceId: 'write', targetId: 'idem' },
        { sourceId: 'idem', targetId: 'tcp' },
        { sourceId: 'idem', targetId: 'idem' },
      ],
    }
    const { nodes, edges } = galaxyElements(graph, [net], colors)
    expect(nodes.map((n) => [n.data.id, n.data.kind, n.data.colorKey, n.classes])).toEqual([
      ['transport', 'topic', 'topic-1', 'topic has-recommended'],
      ['idem', 'keyword', 'topic-1', 'keyword'],
      ['write', 'keyword', 'topic-1', 'keyword recommended'],
    ])
    expect(nodes.find((n) => n.data.id === 'idem')?.data.size).toBe(keywordDiameter(3))
    // 같은 쌍은 한 번만, 이 단계에 없는 끝(tcp)·자기 자신으로 가는 선은 뺀다
    expect(edges.map((e) => e.data.id)).toEqual(['idem|write'])
  })

  it('색을 모르는 주제는 기타 색', () => {
    const graph: TopicGraph = { topics: [topic('x')], keywords: [], edges: [] }
    expect(galaxyElements(graph, ROOT, colors).nodes[0].data.colorKey).toBe('topic-other')
  })
})

describe('키워드 문서 · 문구', () => {
  const graph: TopicGraph = {
    topics: [],
    keywords: [keyword('idem', 'net'), keyword('tcp', 'transport')],
    edges: [],
  }

  it('누른 키워드의 문서. 이 단계에 없거나 고르지 않았으면 null', () => {
    expect(keywordDocs(graph, [net], 'idem')?.documents).toEqual([
      { noteId: 'note-idem', title: 'idem 노트' },
    ])
    expect(keywordDocs(graph, [net], 'tcp')).toBeNull()
    expect(keywordDocs(graph, [net], null)).toBeNull()
  })

  it('주제 둘째 줄과 상단 요약 (W3-22d·e)', () => {
    expect(topicSubtitle(topic('a', { childTopicCount: 2, keywordCount: 4 }), false)).toBe(
      '하위 주제 2 · 키워드 4',
    )
    expect(topicSubtitle(topic('a', { keywordCount: 5 }), false)).toBe('키워드 5')
    expect(topicSubtitle(topic('a', { keywordCount: 3 }), true)).toBe('하위 주제 · 키워드 3')
    expect(levelSummary(ROOT, 4, 0)).toBe('최상위 주제 4')
    expect(levelSummary([net], 2, 4)).toBe('하위 주제 2 · 키워드 4')
  })

  it('노드 크기는 범위 안에서 커진다', () => {
    expect(topicDiameter(0)).toBeLessThan(topicDiameter(4))
    expect(topicDiameter(100)).toBe(topicDiameter(1000))
    expect(keywordDiameter(0)).toBeLessThan(keywordDiameter(3))
    expect(keywordDiameter(100)).toBe(keywordDiameter(1000))
  })
})

describe('휠 줌으로 들어갈 주제는 마우스 위치로 고른다', () => {
  // 화면 1000×600, 기준 배율 1, pan 0. 가운데 주제(400~600)와 오른쪽 가장자리 주제(850~950)
  const center = { id: 'center', circle: { x: 500, y: 300, r: 100 } }
  const edge = { id: 'edge', circle: { x: 900, y: 300, r: 50 } }
  const topics = [center, edge]
  const viewportCenter = { x: 500, y: 300 }
  /** Cytoscape 휠 줌: 마우스(화면 좌표) 아래의 그래프 점을 고정한 채 zoom배로 확대한 뒤의 pan */
  const panAfterWheel = (mouse: { x: number; y: number }, zoom: number) => ({
    x: mouse.x - mouse.x * zoom,
    y: mouse.y - mouse.y * zoom,
  })

  it('가장자리 주제에 마우스를 두고 기준의 1.8배로 확대하면 그 주제로 들어간다', () => {
    const mouse = { x: 900, y: 300 }
    const zoom = GALAXY_LEVEL_ZOOM
    const pan = panAfterWheel(mouse, zoom)
    expect(
      zoomStep({
        zoom,
        baseZoom: 1,
        point: renderedToModel(mouse, pan, zoom),
        topics,
        canGoUp: false,
      }),
    ).toEqual({ kind: 'enter', topicId: 'edge' })
    // 화면 가운데로 고르면 마우스까지 거리의 일부만 따라가 가장자리 주제에 닿지 못한다 (고치기 전 동작)
    const byCenter = renderedToModel(viewportCenter, pan, zoom)
    expect(byCenter.x).toBeLessThan(edge.circle.x - edge.circle.r)
  })

  it('마우스가 빈 곳이면 들어가지 않는다 (화면 가운데에 주제가 있어도)', () => {
    const mouse = { x: 720, y: 520 }
    const zoom = GALAXY_LEVEL_ZOOM
    const pan = panAfterWheel(mouse, zoom)
    expect(
      zoomStep({
        zoom,
        baseZoom: 1,
        point: renderedToModel(mouse, pan, zoom),
        topics,
        canGoUp: true,
      }),
    ).toBeNull()
  })

  it('− + 버튼은 화면 가운데 기준', () => {
    const zoom = GALAXY_LEVEL_ZOOM
    // 가운데를 고정점으로 확대
    const pan = panAfterWheel(viewportCenter, zoom)
    expect(
      zoomStep({
        zoom,
        baseZoom: 1,
        point: renderedToModel(viewportCenter, pan, zoom),
        topics,
        canGoUp: false,
      }),
    ).toEqual({ kind: 'enter', topicId: 'center' })
  })

  it('기준 배율 근처면 그대로, 1/1.8배 이하로 축소하면 위로 (최상위면 그대로)', () => {
    const point = { x: 900, y: 300 }
    expect(zoomStep({ zoom: 1.5, baseZoom: 1, point, topics, canGoUp: true })).toBeNull()
    expect(
      zoomStep({ zoom: 1 / GALAXY_LEVEL_ZOOM, baseZoom: 1, point, topics, canGoUp: true }),
    ).toEqual({ kind: 'up' })
    expect(zoomStep({ zoom: 0.3, baseZoom: 1, point, topics, canGoUp: false })).toBeNull()
  })
})

describe('미분류 노트의 키워드', () => {
  const colors = new Map<string, TopicColorKey>([['net', 'topic-1']])
  const root: TopicGraph = {
    topics: [topic('net')],
    keywords: [],
    edges: [],
    unassigned: { keywordCount: 2, hasRecommended: false },
  }

  it('최상위 끝에 "미분류" 노드(topic-none 색)를 둔다', () => {
    const { nodes } = galaxyElements(root, ROOT, colors)
    expect(nodes.map((n) => [n.data.id, n.data.colorKey, n.data.label])).toEqual([
      ['net', 'topic-1', 'net\n키워드 2'],
      ['none', 'topic-none', '미분류\n키워드 2'],
    ])
    expect(levelTopics(root, ROOT).map((t) => t.name)).toEqual(['net', '미분류'])
  })

  it('미분류 키워드가 없거나 하위 단계면 미분류 노드가 없다', () => {
    expect(
      levelTopics({ ...root, unassigned: { keywordCount: 0, hasRecommended: false } }, ROOT),
    ).toHaveLength(1)
    expect(levelTopics({ ...root, unassigned: null }, ROOT)).toHaveLength(1)
    expect(levelTopics(root, [net])).toHaveLength(1)
  })

  it('미분류에 들어가면 주제가 없는 키워드(topicId null)만, 색은 topic-none', () => {
    const inside: TopicGraph = {
      topics: [],
      keywords: [keyword('cache', 'net'), { ...keyword('ttl', 'net'), topicId: null }],
      edges: [],
    }
    const path = enter(ROOT, { id: 'none', name: '미분류' })
    expect(directKeywords(inside.keywords, 'none').map((k) => k.id)).toEqual(['ttl'])
    const { nodes } = galaxyElements(inside, path, colors)
    expect(nodes.map((n) => [n.data.id, n.data.colorKey])).toEqual([['ttl', 'topic-none']])
  })
})

describe('원 판정은 중심 거리로 (리뷰 7)', () => {
  const big = { id: 'big', circle: { x: 0, y: 0, r: 100 } }
  const small = { id: 'small', circle: { x: 120, y: 0, r: 40 } }

  it('네모 상자의 빈 모서리는 주제가 아니다', () => {
    // (90, 90)은 상자(−100~100) 안이지만 원 밖 (거리 127)
    expect(topicAt({ x: 90, y: 90 }, [big])).toBeNull()
    expect(topicAt({ x: 60, y: 60 }, [big])).toBe('big')
  })

  it('겹치면 중심에 가장 가까운 주제 (id 순이 아니라)', () => {
    // (95, 0): big 중심까지 95, small 중심까지 25
    expect(topicAt({ x: 95, y: 0 }, [big, small])).toBe('small')
    expect(topicAt({ x: 95, y: 0 }, [small, big])).toBe('small')
  })
})

describe('주제 목록은 한 번에 만든다 (리뷰 10)', () => {
  it('주제는 id 순, 미분류는 맨 끝에 하나. 그린 목록을 화면이 그대로 쓴다', () => {
    const graph: TopicGraph = {
      topics: [topic('z'), topic('a')],
      keywords: [],
      edges: [],
      unassigned: { keywordCount: 1, hasRecommended: false },
    }
    const elements = galaxyElements(graph, ROOT, new Map())
    expect(elements.topics.map((t) => t.id)).toEqual(['a', 'z', 'none'])
    expect(levelTopics(graph, ROOT).map((t) => t.id)).toEqual(['a', 'z', 'none'])
    // 응답의 주제 배열은 바꾸지 않는다
    expect(graph.topics.map((t) => t.id)).toEqual(['z', 'a'])
  })

  it('그린 키워드 목록(바로 속한 것만)을 함께 준다', () => {
    const graph: TopicGraph = {
      topics: [],
      keywords: [keyword('b', 'net'), keyword('a', 'net'), keyword('x', 'transport')],
      edges: [],
    }
    expect(galaxyElements(graph, [net], new Map()).keywords.map((k) => k.id)).toEqual(['a', 'b'])
  })
})

describe('경로 이름은 받은 데이터 기준 (리뷰 3)', () => {
  const root: TopicGraph = {
    topics: [topic('net', { name: '네트워크(새 이름)' })],
    keywords: [],
    edges: [],
  }
  const netLevel: TopicGraph = {
    topics: [topic('transport', { name: '전송' })],
    keywords: [],
    edges: [],
  }
  const levelOf = (id: string | null) => (id === null ? root : id === 'net' ? netLevel : undefined)

  it('각 칸의 이름을 바로 위 단계의 목록에서 고친다', () => {
    expect(refreshPathNames([net, transport, congestion], levelOf)).toEqual([
      { id: 'net', name: '네트워크(새 이름)' },
      { id: 'transport', name: '전송' },
      // 아직 받지 않은 단계(transport 안)는 그대로
      congestion,
    ])
  })

  it('바뀐 것이 없으면 같은 배열', () => {
    const path = [{ id: 'net', name: '네트워크(새 이름)' }]
    expect(refreshPathNames(path, levelOf)).toBe(path)
  })
})
