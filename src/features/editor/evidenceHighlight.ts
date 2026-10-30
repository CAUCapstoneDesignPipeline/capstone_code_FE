// 근거 원문 구간 강조 (F-GRA-03). 패널에서 고른 근거 문장을 편집기에 표시만 한다. 원문은 바꾸지 않는다.
// 위치는 UTF-16 offset(E1)이고, CodeMirror 문서 위치도 UTF-16 단위라 그대로 쓴다.
import { StateEffect, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

export interface EvidenceSpanLike {
  startOffset: number
  endOffset: number
  /** 분석 당시 원문 문장 그대로 */
  quote: string
}

/**
 * 근거를 지금 본문의 어디에 표시할지.
 * - exact: 분석 뒤 그 자리가 바뀌지 않음
 * - moved: 본문을 고쳐 위치가 밀렸지만 같은 문장이 있음 (원래 위치에 가장 가까운 것)
 * - missing: 같은 문장이 지금 본문에 없음
 */
export type EvidenceLocation =
  { kind: 'exact' | 'moved'; from: number; to: number } | { kind: 'missing' }

export function locateEvidence(doc: string, evidence: EvidenceSpanLike): EvidenceLocation {
  const { startOffset: start, endOffset: end, quote } = evidence
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
