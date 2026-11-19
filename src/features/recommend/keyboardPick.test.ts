import { describe, expect, it } from 'vitest'
import type { InsertTarget } from './insertBridge'
import { livePicking, type Picking } from './keyboardPick'

const editor = (noteId: string): InsertTarget => ({
  noteId,
  boundaries: () => [0, 10],
  describe: () => null,
  showIndicator: () => {},
  insert: async () => ({ ok: true }),
  save: async () => ({ ok: true }),
})

describe('키보드로 고르기 취소 (Issue #43)', () => {
  const a = editor('note-1')
  const picking: Picking = { id: 'r1', index: 1, target: a }

  it('같은 카드·같은 편집기·패널의 노트면 그대로', () => {
    expect(livePicking(picking, 'r1', a, 'note-1')).toBe(picking)
  })

  it('보이는 카드가 바뀌면 취소', () => {
    expect(livePicking(picking, 'r2', a, 'note-1')).toBeNull()
    expect(livePicking(picking, null, a, 'note-1')).toBeNull()
  })

  it('열린 노트(편집기)가 바뀌면 취소 (같은 노트를 다시 열어 편집기가 새로 생겨도)', () => {
    expect(livePicking(picking, 'r1', editor('note-2'), 'note-1')).toBeNull()
    expect(livePicking(picking, 'r1', editor('note-1'), 'note-1')).toBeNull()
    expect(livePicking(picking, 'r1', null, 'note-1')).toBeNull()
  })

  it('패널의 노트가 바뀌면 취소', () => {
    expect(livePicking(picking, 'r1', a, 'note-2')).toBeNull()
  })

  it('고르고 있지 않으면 null', () => {
    expect(livePicking(null, 'r1', a, 'note-1')).toBeNull()
  })
})
