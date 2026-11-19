// 키보드로 카드를 넣을 자리를 고르는 상태 (Issue #43). 손잡이에서 Space·Enter로 집고 ↑↓로 자리를 고른다.
import type { InsertTarget } from './insertBridge'
import { canInsertInto } from './insertFlow'

export interface Picking {
  /** 집은 카드 */
  id: string
  /** 고른 자리 (target.boundaries()의 순번) */
  index: number
  /** 고르기 시작할 때 열려 있던 편집기 */
  target: InsertTarget
}

/**
 * 고르기가 아직 유효하면 그대로, 아니면 null.
 * 보이는 카드가 바뀌었거나, 열린 노트(편집기)가 바뀌었거나, 그 노트가 이 패널의 노트가 아니면 취소된 것으로 본다.
 * 취소되면 부른 쪽이 고르던 편집기의 표시선을 지운다.
 */
export function livePicking(
  picking: Picking | null,
  currentId: string | null,
  target: InsertTarget | null,
  panelNoteId: string | null,
): Picking | null {
  if (!picking) return null
  if (picking.id !== currentId || picking.target !== target) return null
  if (!canInsertInto(target, panelNoteId)) return null
  return picking
}
