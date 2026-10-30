// 편집기 포커스 기록 (StateField용). 포커스가 없으면 커서가 표·블록 수식 안이어도 그려 보인다
// (livePreview와 같은 규칙). tablePreview·mathPreview가 같은 값을 넣으므로 편집기에는 한 번만 들어간다.
import { StateEffect, StateField, type EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

const setFocused = StateEffect.define<boolean>()

export const focusedField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFocused)) value = e.value
    return value
  },
})

/**
 * 커서·선택이 블록 줄 범위(양 끝 포함)에 닿아 있는지. 포커스가 없으면 닿지 않은 것으로 본다.
 * 위젯의 가장자리는 줄 시작이므로 노드가 아니라 줄 범위로 본다 (들여쓴 블록에서 위젯을 누르거나 화살표로 들어가도 원문으로 바뀌게).
 */
export const selectionTouches = (
  selection: EditorSelection,
  focused: boolean,
  block: { from: number; to: number },
) => focused && selection.ranges.some((r) => r.from <= block.to && r.to >= block.from)

export const focusTracking = [
  focusedField,
  EditorView.focusChangeEffect.of((_state, focusing) => setFocused.of(focusing)),
]
