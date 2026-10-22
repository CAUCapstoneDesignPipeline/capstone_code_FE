import { describe, expect, it } from 'vitest'
import type { GraphNode, Topic } from '../api'
import { nodeColorKey, nodeTopicId, topicColorKeys } from './topicColors'

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

describe('주제 색', () => {
  it('만든 순서로 칸을 정해, 주제 순서를 바꿔도 색이 그대로다', () => {
    const a = topic('a', '2026-10-01T00:00:00Z', 1)
    const b = topic('b', '2026-10-02T00:00:00Z', 0)
    expect(topicColorKeys([b, a])).toEqual(
      new Map([
        ['a', 'topic-1'],
        ['b', 'topic-2'],
      ]),
    )
  })

  it('9번째 주제부터는 기타', () => {
    const topics = Array.from({ length: 9 }, (_, i) =>
      topic(`t${i}`, `2026-10-0${i + 1}T00:00:00Z`),
    )
    const keys = topicColorKeys(topics)
    expect(keys.get('t7')).toBe('topic-8')
    expect(keys.get('t8')).toBe('topic-other')
  })

  it('노드 색: 주제 하나면 그 주제, 미분류, 여러 주제, 모르는 주제', () => {
    const keys = topicColorKeys([topic('a', '2026-10-01T00:00:00Z')])
    expect(nodeColorKey(node('a', 'a'), keys)).toBe('topic-1')
    expect(nodeColorKey(node(null), keys)).toBe('topic-none')
    expect(nodeTopicId(node('a', null))).toBe('mixed')
    expect(nodeColorKey(node('a', 'b'), keys)).toBe('topic-mixed')
    expect(nodeColorKey(node('zzz'), keys)).toBe('topic-other')
  })
})
