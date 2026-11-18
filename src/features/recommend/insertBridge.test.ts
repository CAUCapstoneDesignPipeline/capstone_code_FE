import { describe, expect, it } from 'vitest'
import { InsertBridge } from './insertBridge'

describe('끌고 있는 카드를 놓을 수 있는 노트 (Issue #43)', () => {
  it('끌기 시작한 추천 패널의 노트에만 놓을 수 있다', () => {
    const bridge = new InsertBridge()
    expect(bridge.acceptsDrop('note-1')).toBe(false)
    bridge.setDragSource('note-1')
    expect(bridge.acceptsDrop('note-1')).toBe(true)
    expect(bridge.acceptsDrop('note-2')).toBe(false)
    bridge.setDragSource(null)
    expect(bridge.acceptsDrop('note-1')).toBe(false)
  })
})
