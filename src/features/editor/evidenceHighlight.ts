// 근거 원문 구간 강조 (F-GRA-03). 패널에서 고른 근거 문장을 편집기에 표시만 한다. 원문은 바꾸지 않는다.
// 위치는 UTF-16 offset(E1)이고, CodeMirror 문서 위치도 UTF-16 단위라 그대로 쓴다.
import { StateEffect, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

export interface EvidenceSpanLike {
  startOffset: number
  endOffset: number
  /** 분석 당시 원문 문장 그대로 */
  quote: string
  /** 분석 당시 노트 version. 있으면 지금 노트의 version과 비교한다 */
  noteVersion?: number
}

/**
 * 근거를 지금 본문의 어디에 표시할지.
 * - exact: 분석 뒤 그 자리가 바뀌지 않음
 * - moved: 본문을 고쳐 위치가 밀렸지만 같은 문장이 있음 (원래 위치에 가장 가까운 것)
 * - missing: 같은 문장이 지금 본문에 없음
 * - outdated: 분석한 version과 지금 노트의 version이 다름. 강조하지 않고(moved도 하지 않는다) 카드의 quote만 보인다
 *   (11/04 회의: 근거 문장을 고쳐 저장한 직후는 아직 current일 수 있지만 강조는 하지 않는다)
 */
export type EvidenceLocation =
  { kind: 'exact' | 'moved'; from: number; to: number } | { kind: 'missing' | 'outdated' }

/**
 * docVersion은 지금 열린 노트의 저장된 version이다. 근거의 noteVersion과 다르면 outdated.
 * 둘 중 하나라도 모르면 비교하지 않고, version이 같으면 지금까지처럼 exact·moved·missing을 가린다.
 */
export function locateEvidence(
  doc: string,
  evidence: EvidenceSpanLike,
  docVersion?: number,
): EvidenceLocation {
  const { startOffset: start, endOffset: end, quote } = evidence
  if (
    evidence.noteVersion !== undefined &&
    docVersion !== undefined &&
    evidence.noteVersion !== docVersion
  ) {
    return { kind: 'outdated' }
  }
  if (!quote) return { kind: 'missing' }
  if (doc.slice(start, end) === quote) return { kind: 'exact', from: start, to: end }
  let best = -1
  for (let at = doc.indexOf(quote); at >= 0; at = doc.indexOf(quote, at + 1)) {
    if (best < 0 || Math.abs(at - start) < Math.abs(best - start)) best = at
  }
  return best < 0 ? { kind: 'missing' } : { kind: 'moved', from: best, to: best + quote.length }
}

/** 강조할 구간을 바꾼다. null이면 지운다. */
export const setEvidenceHighlight = StateEffect.define<{ from: number; to: number } | null>()

const mark = Decoration.mark({ class: 'cm-evidence' })

/** 강조 구간. 입력하면 함께 밀리고, 강조한 글이 모두 지워지면 사라진다. */
const evidenceField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setEvidenceHighlight)) {
        next =
          e.value && e.value.to > e.value.from
            ? Decoration.set([mark.range(e.value.from, e.value.to)])
            : Decoration.none
      }
    }
    return next
  },
  provide: (f) => EditorView.decorations.from(f),
})

export const evidenceHighlight = [evidenceField]

/** 지금 강조한 구간들 (테스트와 확인용) */
export function highlightedRanges(state: EditorState): [number, number][] {
  const out: [number, number][] = []
  state.field(evidenceField, false)?.between(0, state.doc.length, (from, to) => {
    out.push([from, to])
  })
  return out
}
