import { describe, expect, it } from 'vitest'
import type { GraphNode, Topic } from '../api'
import { assignTopicSlots, nodeColorKey, nodeTopicId, topicColorKeys } from './topicColors'

const topic = (id: string, createdAt: string, sortOrder = 0): Topic => ({
  id,
  name: id,
  sortOrder,
  createdAt,
  noteCount: 0,
})

const node = (...topicIds: (string | null)[]): GraphNode => ({
  id: 'c',
  label: '개념',
  notes: topicIds.map((topicId, i) => ({ id: `n${i}`, title: `노트 ${i}`, topicId })),
})

const keysOf = (topics: Topic[]) => topicColorKeys(topics, assignTopicSlots(topics, {}))

describe('주제 색', () => {
  it('처음에는 만든 순서로 칸을 정해, 주제 순서와 관계없다', () => {
    const a = topic('a', '2026-10-01T00:00:00Z', 1)
    const b = topic('b', '2026-10-02T00:00:00Z', 0)
    expect(keysOf([b, a])).toEqual(
      new Map([
        ['a', 'topic-1'],
        ['b', 'topic-2'],
      ]),
    )
  })

  it('주제를 지워도 남은 주제의 칸은 그대로이고, 빈 칸은 다음 새 주제가 쓴다', () => {
    const a = topic('a', '2026-10-01T00:00:00Z')
    const b = topic('b', '2026-10-02T00:00:00Z')
    const c = topic('c', '2026-10-03T00:00:00Z')
    const first = assignTopicSlots([a, b, c], {})
    const afterDelete = assignTopicSlots([b, c], first)
    expect(afterDelete).toEqual({ b: 2, c: 3 })
    const d = topic('d', '2026-10-04T00:00:00Z')
    expect(assignTopicSlots([b, c, d], afterDelete)).toEqual({ b: 2, c: 3, d: 1 })
  })

  it('9번째 주제부터는 기타. 칸이 비면 그때 칸을 받는다', () => {
    const topics = Array.from({ length: 9 }, (_, i) =>
      topic(`t${i}`, `2026-10-0${i + 1}T00:00:00Z`),
    )
    const slots = assignTopicSlots(topics, {})
    const keys = topicColorKeys(topics, slots)
    expect(keys.get('t7')).toBe('topic-8')
    expect(keys.get('t8')).toBe('topic-other')
    expect(assignTopicSlots(topics.slice(1), slots).t8).toBe(1)
  })

  it('저장된 값이 깨져 있으면 무시한다', () => {
    const a = topic('a', '2026-10-01T00:00:00Z')
    const b = topic('b', '2026-10-02T00:00:00Z')
    expect(assignTopicSlots([a, b], { a: 99, b: 1 })).toEqual({ b: 1, a: 2 })
    expect(assignTopicSlots([a, b], { a: 1, b: 1 })).toEqual({ a: 1, b: 2 })
  })

  it('노드 색: 주제 하나면 그 주제, 미분류, 여러 주제, 모르는 주제', () => {
    const keys = keysOf([topic('a', '2026-10-01T00:00:00Z')])
    expect(nodeColorKey(node('a', 'a'), keys)).toBe('topic-1')
    expect(nodeColorKey(node(null), keys)).toBe('topic-none')
    expect(nodeTopicId(node('a', null))).toBe('mixed')
    expect(nodeColorKey(node('a', 'b'), keys)).toBe('topic-mixed')
    expect(nodeColorKey(node('zzz'), keys)).toBe('topic-other')
  })
})
