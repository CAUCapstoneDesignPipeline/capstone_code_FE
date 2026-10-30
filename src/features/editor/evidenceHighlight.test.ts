import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  evidenceHighlight,
  highlightedRanges,
  locateEvidence,
  setEvidenceHighlight,
} from './evidenceHighlight'

const quote = '클라이언트는 **재전송**한다.'

describe('근거 위치', () => {
  it('그 자리가 그대로면 exact', () => {
    const doc = `# 제목\n${quote}`
    expect(locateEvidence(doc, { startOffset: 5, endOffset: 5 + quote.length, quote })).toEqual({
      kind: 'exact',
      from: 5,
      to: 5 + quote.length,
    })
  })

  it('앞에 글을 더해 밀렸으면 원래 위치에 가장 가까운 같은 문장 (moved)', () => {
    // 분석 때 본문은 `${quote}\n${quote}`이고 근거는 두 번째 문장. 그 뒤 맨 앞에 '추가 '를 넣었다.
    const L = quote.length
    const doc = `추가 ${quote}\n${quote}`
    expect(locateEvidence(doc, { startOffset: L + 1, endOffset: 2 * L + 1, quote })).toEqual({
      kind: 'moved',
      from: L + 4,
      to: 2 * L + 4,
    })
  })

  it('문장이 바뀌었으면 missing', () => {
    expect(
      locateEvidence('클라이언트는 재전송하지 않는다.', { startOffset: 0, endOffset: 5, quote }),
    ).toEqual({
      kind: 'missing',
    })
  })

  it('UTF-16 위치: 이모지(서로게이트 쌍) 뒤의 문장도 맞는다', () => {
    const doc = `😀 ${quote}`
    expect(locateEvidence(doc, { startOffset: 3, endOffset: 3 + quote.length, quote }).kind).toBe(
      'exact',
    )
  })
})

describe('강조 표시', () => {
  const create = () => EditorState.create({ doc: `가${quote}`, extensions: evidenceHighlight })
  const highlight = (state: EditorState, range: { from: number; to: number } | null) =>
    state.update({ effects: setEvidenceHighlight.of(range) }).state

  it('강조는 원문을 바꾸지 않고, 앞에 입력하면 함께 밀린다', () => {
    let state = highlight(create(), { from: 1, to: 1 + quote.length })
    state = state.update({ changes: { from: 0, insert: '앞글 ' } }).state
    expect(state.doc.toString()).toBe(`앞글 가${quote}`)
    expect(highlightedRanges(state).map(([f, t]) => state.doc.sliceString(f, t))).toEqual([quote])
  })

  it('null이면 지우고, 강조한 글을 모두 지우면 사라진다', () => {
    const on = highlight(create(), { from: 1, to: 1 + quote.length })
    expect(highlightedRanges(highlight(on, null))).toEqual([])
    const cut = on.update({ changes: { from: 1, to: 1 + quote.length } }).state
    expect(highlightedRanges(cut)).toEqual([])
  })
})
