import { describe, expect, it } from 'vitest'
import type { TopicGraph, TopicGraphKeyword, TopicGraphTopic } from '../../api'
import type { TopicColorKey } from '../../lib/topicColors'
import {
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
