import { describe, expect, it } from 'vitest'
import type { Graph, GraphNode, Topic } from '../../api'
import {
  edgeKey,
  initialPositions,
  legendEntries,
  overlaps,
  placeNear,
  sortedById,
  selectedEdgeInfo,
  topicsInGraph,
  unitHash,
} from './pageGraph'

const topic = (id: string, name = id): Topic => ({
  id,
  name,
  sortOrder: 0,
  noteCount: 0,
  createdAt: '2026-10-01T00:00:00Z',
})
const page = (id: string, topicId: string | null): GraphNode => ({ id, title: id, topicId })

describe('edgeKey', () => {
  it('방향과 관계없이 같은 값', () => {
    expect(edgeKey({ sourceId: 'b', targetId: 'a' })).toBe('a|b')
    expect(edgeKey({ sourceId: 'a', targetId: 'b' })).toBe('a|b')
  })
})

describe('initialPositions', () => {
  it('같은 그래프면 늘 같은 시작 위치 (열 때마다 바뀌지 않음)', () => {
    const nodes = [page('n1', 't1'), page('n2', 't1'), page('n3', null)]
    const a = initialPositions(nodes)
    const b = initialPositions([...nodes].reverse())
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort())
  })

  it('주제로 묶지 않는다: 주제가 바뀌어도 위치는 id로만 정해진다', () => {
    const a = initialPositions([page('n1', 't1'), page('n2', 't1')])
    const b = initialPositions([page('n1', 't2'), page('n2', null)])
    expect(b).toEqual(a)
  })

  it('모든 페이지가 페이지 수에 맞춘 한 원 안에 있다', () => {
    const nodes = Array.from({ length: 25 }, (_, i) => page(`n${i}`, i % 2 ? 't1' : 't2'))
    const pos = initialPositions(nodes)
    expect(pos.size).toBe(25)
    for (const p of pos.values()) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(120 * 5)
  })

  it('unitHash는 0 이상 1 미만', () => {
    for (const s of ['', 'a', '재시도 정책', 'x'.repeat(100)]) {
      expect(unitHash(s)).toBeGreaterThanOrEqual(0)
      expect(unitHash(s)).toBeLessThan(1)
    }
  })
})

describe('topicsInGraph · legendEntries', () => {
  const topics = [topic('t1', '네트워크'), topic('t2', 'DB'), topic('t3', '빈 주제')]
  const nodes = [page('a', 't2'), page('b', null), page('c', 't1'), page('d', 'new')]

  it('주제 목록 순서, 목록에 없는 주제, 미분류 순서. 노드가 없는 주제는 빠진다', () => {
    expect(topicsInGraph(nodes, topics)).toEqual(['t1', 't2', 'new', null])
  })

  it('범례는 나온 색만 이름과 함께', () => {
    const keys = new Map([
      ['t1', 'topic-1' as const],
      ['t2', 'topic-2' as const],
    ])
    expect(legendEntries(nodes, topics, keys)).toEqual([
      { key: 'topic-1', label: '네트워크' },
      { key: 'topic-2', label: 'DB' },
      { key: 'topic-other', label: '기타 주제' },
      { key: 'topic-none', label: '미분류' },
    ])
  })
})

describe('selectedEdgeInfo', () => {
  const graph: Graph = {
    scope: 'all',
    nodes: [page('a', null), page('b', null)],
    edges: [
      { sourceId: 'a', targetId: 'b', sharedKeywords: ['재전송', '중복 요청'] },
      { sourceId: 'b', targetId: 'x' },
    ],
  }

  it('두 페이지와 공유 키워드', () => {
    expect(selectedEdgeInfo(graph, 'a|b')).toMatchObject({
      source: { id: 'a' },
      target: { id: 'b' },
      keywords: ['재전송', '중복 요청'],
    })
  })

  it('키워드가 없으면 빈 배열, 없는 선·끝 페이지가 없으면 null', () => {
    const noKeywords: Graph = { ...graph, edges: [{ sourceId: 'a', targetId: 'b' }] }
    expect(selectedEdgeInfo(noKeywords, 'a|b')?.keywords).toEqual([])
    expect(selectedEdgeInfo(graph, 'a|z')).toBeNull()
    expect(selectedEdgeInfo(graph, 'b|x')).toBeNull()
    expect(selectedEdgeInfo(graph, null)).toBeNull()
  })
})

describe('넣는 순서 고정 (fcose 타일링이 순서를 따른다)', () => {
  it('노드는 id 순, 선은 edgeKey 순. 원래 배열은 바꾸지 않는다', () => {
    const nodes = [page('c', null), page('a', 't1'), page('b', null)]
    expect(sortedById(nodes, (n) => n.id).map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(sortedById([...nodes].reverse(), (n) => n.id)).toEqual(sortedById(nodes, (n) => n.id))
    expect(nodes.map((n) => n.id)).toEqual(['c', 'a', 'b'])
    const edges = [
      { sourceId: 'c', targetId: 'b' },
      { sourceId: 'b', targetId: 'a' },
    ]
    expect(sortedById(edges, edgeKey).map(edgeKey)).toEqual(['a|b', 'b|c'])
  })
})

describe('새 페이지 자리 (placeNear)', () => {
  const size = { width: 100, height: 30 }
  const center = { x: 0, y: 0 }

  it('겹치는 페이지가 없으면 지금까지처럼 중심에서 gap만큼 angle 방향', () => {
    expect(placeNear(center, 0, size, [], 80)).toEqual({ x: 80, y: 0 })
    const p = placeNear(center, Math.PI / 2, size, [], 80)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(80)
  })

  it('연결 없는 페이지를 한 번에 하나씩 더해도 같은 자리에 쌓이지 않는다', () => {
    // 화면(중심)은 그대로, 매번 added가 하나뿐이라 각도도 0으로 같다
    const taken: { x: number; y: number; width: number; height: number }[] = []
    for (let i = 0; i < 6; i++) {
      const p = placeNear(center, 0, size, taken, 80)
      expect(taken.some((t) => overlaps({ ...p, ...size }, t))).toBe(false)
      taken.push({ ...p, ...size })
    }
  })

  it('빈자리가 없으면 첫 자리를 쓴다', () => {
    const wall = [{ x: 0, y: 0, width: 10_000, height: 10_000 }]
    expect(placeNear(center, 0, size, wall, 80, 2, 4)).toEqual({ x: 80, y: 0 })
  })

  it('겹침은 여백까지 본다', () => {
    const a = { x: 0, y: 0, width: 100, height: 30 }
    expect(overlaps(a, { x: 105, y: 0, width: 100, height: 30 })).toBe(true)
    expect(overlaps(a, { x: 109, y: 0, width: 100, height: 30 })).toBe(false)
    expect(overlaps(a, { x: 0, y: 39, width: 100, height: 30 })).toBe(false)
  })
})
