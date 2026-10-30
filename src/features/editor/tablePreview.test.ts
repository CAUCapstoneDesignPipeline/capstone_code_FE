import { ensureSyntaxTree } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import {
  buildTableDecorations,
  parseTable,
  tableDecorations,
  tablePreview,
  type TableModel,
} from './tablePreview'

function stateOf(doc: string, cursor: number) {
  const base = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
  return base.update({ selection: EditorSelection.cursor(cursor) }).state
}

/** 표로 바꿔 그린 범위의 원문과 표 모양, 원문으로 둔 줄 번호 */
function decorate(doc: string, cursor: number, focused = true) {
  const state = stateOf(doc, cursor)
  const tables: [string, TableModel][] = []
  const sourceLines: number[] = []
  buildTableDecorations(state, focused).between(0, doc.length, (from, to, deco) => {
    const widget = deco.spec.widget as { model?: TableModel } | undefined
    if (widget?.model) tables.push([doc.slice(from, to), widget.model])
    else if ((deco.spec as { class?: string }).class === 'cm-lp-table-src') {
      sourceLines.push(state.doc.lineAt(from).number)
    }
  })
  return { tables, sourceLines }
}

const table = '| 이름 | 값 |\n|:--|--:|\n| a | 1 |'

describe('표', () => {
  it('커서가 표 밖이면 원문 줄들을 표 하나로 바꾼다', () => {
    const doc = `${table}\n\n끝`
    const d = decorate(doc, doc.length)
    expect(d.tables).toEqual([
      [
        table,
        {
          align: ['left', 'right'],
          rows: [
            [['이름'], ['값']],
            [['a'], ['1']],
          ],
        },
      ],
    ])
    expect(d.sourceLines).toEqual([])
  })

  it('커서가 표에 닿으면 원문을 드러낸다', () => {
    const d = decorate(`${table}\n\n끝`, 3)
    expect(d.tables).toEqual([])
    expect(d.sourceLines).toEqual([1, 2, 3])
  })

  it('편집기에 포커스가 없으면 커서가 표 안이어도 표로 그린다', () => {
    expect(decorate(`${table}\n\n끝`, 3, false).tables).toHaveLength(1)
  })

  it('인용 안의 표는 줄 앞 기호가 있어 원문으로 둔다', () => {
    const doc = `> ${table.replace(/\n/g, '\n> ')}\n\n끝`
    expect(decorate(doc, doc.length).tables).toEqual([])
  })

  it('코드 블록 안의 | 줄은 표가 아니다', () => {
    const doc = `\`\`\`\n${table}\n\`\`\`\n끝`
    const d = decorate(doc, doc.length)
    expect(d.tables).toEqual([])
    expect(d.sourceLines).toEqual([])
  })
})

describe('parseTable', () => {
  const model = (doc: string) => {
    const state = stateOf(doc, 0)
    const tree = ensureSyntaxTree(state, doc.length, 1000)!
    let found = null as TableModel | null
    tree.iterate({
      enter(node) {
        if (node.name === 'Table') found = parseTable(state, node.node)
      },
    })
    return found
  }

  it('빈 칸을 지키고, 칸이 모자란 줄은 머리글 칸 수에 맞춘다', () => {
    expect(model('| a | b | c |\n|---|---|---|\n| 1 |  | 3 |\n| x |')).toEqual({
      align: [null, null, null],
      rows: [
        [['a'], ['b'], ['c']],
        [['1'], [], ['3']],
        [['x'], [], []],
      ],
    })
  })

  it('칸 안의 굵게·코드·링크는 모양을 살리고 기호·주소는 뺀다', () => {
    const m = model('| 글 |\n|---|\n| **굵게** `코드` [링크](https://a.com) \\| 끝 |')
    expect(m!.rows[1][0]).toEqual([
      { tag: 'strong', children: ['굵게'] },
      ' ',
      { tag: 'code', children: ['코드'] },
      ' ',
      { tag: 'link', children: ['링크'] },
      ' ',
      '|',
      ' 끝',
    ])
  })
})

describe('들여쓴 표', () => {
  it('커서가 줄 맨 앞(위젯 가장자리)에 오면 원문으로 바꾼다', () => {
    const doc = '  | a | b |\n  |---|---|\n  | 1 | 2 |\n\n끝'
    expect(decorate(doc, doc.length).tables).toHaveLength(1)
    expect(decorate(doc, 0).sourceLines).toEqual([1, 2, 3])
  })
})

describe('tableField', () => {
  const doc = `${table}\n\n문단\n\n끝`

  function focusedState(cursor: number) {
    let state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [markdown({ base: markdownLanguage }), tablePreview],
    })
    const [toEffect] = state.facet(EditorView.focusChangeEffect)
    state = state.update({ effects: toEffect(state, true)! }).state
    return state
  }
  const widgets = (decos: ReturnType<typeof tableDecorations>) => {
    const out: unknown[] = []
    decos.between(0, 1e9, (_f, _t, deco) => {
      if (deco.spec.widget) out.push(deco.spec.widget)
    })
    return out
  }

  it('표 밖에서 커서만 움직이면 장식을 다시 만들지 않는다', () => {
    const state = focusedState(doc.length)
    const before = tableDecorations(state)
    const moved = state.update({ selection: EditorSelection.cursor(doc.indexOf('문단')) }).state
    expect(tableDecorations(moved)).toBe(before)
  })

  it('커서가 표에 들어가면 원문으로, 나오면 다시 표로', () => {
    const state = focusedState(doc.length)
    const inside = state.update({ selection: EditorSelection.cursor(2) }).state
    expect(widgets(tableDecorations(inside))).toEqual([])
    const outside = inside.update({ selection: EditorSelection.cursor(doc.length) }).state
    expect(widgets(tableDecorations(outside))).toHaveLength(1)
  })

  it('표 밖을 고치면 원문이 같은 표의 위젯을 재사용한다', () => {
    const state = focusedState(doc.length)
    const [before] = widgets(tableDecorations(state))
    const edited = state.update({
      changes: { from: doc.length, insert: '!' },
      selection: EditorSelection.cursor(doc.length + 1),
    }).state
    const [after] = widgets(tableDecorations(edited))
    expect(after).toBe(before)
  })
})
