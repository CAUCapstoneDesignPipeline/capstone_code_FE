// 사이드바에서 노트를 끌어 다른 주제에 놓을 때 주고받는 데이터

/** 앱 안에서 끈 노트만 받도록 따로 정한 형식 */
export const NOTE_DRAG_TYPE = 'application/x-capstone-note'

export interface NoteDrag {
  noteId: string
  /** 끌기 시작한 곳. null이면 미분류 */
  fromTopicId: string | null
}

type DragData = Pick<DataTransfer, 'setData' | 'getData' | 'types'>

export function setNoteDrag(data: DragData, drag: NoteDrag) {
  data.setData(NOTE_DRAG_TYPE, JSON.stringify(drag))
}

/** dragover 중에는 내용을 읽을 수 없고 형식만 볼 수 있다 */
export function hasNoteDrag(data: Pick<DataTransfer, 'types'>): boolean {
  return Array.from(data.types).includes(NOTE_DRAG_TYPE)
}

export function readNoteDrag(data: DragData): NoteDrag | null {
  try {
    const value: unknown = JSON.parse(data.getData(NOTE_DRAG_TYPE))
    if (typeof value !== 'object' || value === null) return null
    const { noteId, fromTopicId } = value as Record<string, unknown>
    if (typeof noteId !== 'string') return null
    if (fromTopicId !== null && typeof fromTopicId !== 'string') return null
    return { noteId, fromTopicId }
  } catch {
    return null
  }
}
