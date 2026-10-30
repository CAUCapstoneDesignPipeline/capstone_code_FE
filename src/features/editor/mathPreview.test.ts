import { ensureSyntaxTree } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { buildDecorations } from './livePreview'
import { buildMathDecorations, loadKatex, MathWidget, mathSyntax, renderMath } from './mathPreview'
import { buildTableDecorations, type TableModel } from './tablePreview'

function stateOf(doc: string, cursor = doc.length) {
  const base = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: [mathSyntax] })],
  })
  const state = base.update({ selection: EditorSelection.cursor(cursor) }).state
  ensureSyntaxTree(state, doc.length, 1000)
  return state
}

/** 수식 노드의 원문들 */
function mathNodes(doc: string) {
  const state = stateOf(doc)
  const found: [string, string][] = []
  ensureSyntaxTree(state, doc.length, 1000)!.iterate({
    enter(node) {
      if (node.name === 'InlineMath' || node.name === 'BlockMath') {
        found.push([node.name, doc.slice(node.from, node.to)])
      }
    },
  })
  return found
}

/** 줄 안 수식: 그린 수식(원문, 디스플레이 스타일 여부)과 원문으로 드러낸 범위 */
function inline(doc: string, cursor: number, focused = true) {
  const widgets: [string, string, boolean][] = []
  const sources: string[] = []
  buildDecorations(stateOf(doc, cursor), { focused }).between(0, doc.length, (from, to, deco) => {
    const spec = deco.spec as { class?: string; widget?: unknown }
    if (spec.widget instanceof MathWidget) {
      widgets.push([doc.slice(from, to), spec.widget.tex, spec.widget.display])
    } else if (spec.class === 'cm-lp-math-src') sources.push(doc.slice(from, to))
  })
  return { widgets, sources }
}

/** 블록 수식: 바꿔 그린 범위, 아래에 덧붙인 미리보기, 원문으로 둔 줄 번호 */
function block(doc: string, cursor: number, focused = true) {
  const state = stateOf(doc, cursor)
  const replaced: [string, string][] = []
  const previews: string[] = []
  const sourceLines: number[] = []
  buildMathDecorations(state, focused).between(0, doc.length, (from, to, deco) => {
    const spec = deco.spec as { class?: string; widget?: unknown }
    if (spec.widget instanceof MathWidget) {
      if (from < to) replaced.push([doc.slice(from, to), spec.widget.tex])
      else previews.push(spec.widget.tex)
    } else if (spec.class === 'cm-lp-math-src') sourceLines.push(state.doc.lineAt(from).number)
  })
  return { replaced, previews, sourceLines }
}

describe('수식 문법', () => {
  it('$…$은 줄 안 수식, $$…$$ 줄들은 블록 수식이다', () => {
    expect(mathNodes('넓이는 $\\pi r^2$ 이다')).toEqual([['InlineMath', '$\\pi r^2$']])
    expect(mathNodes('$$\na^2 + b^2\n$$')).toEqual([['BlockMath', '$$\na^2 + b^2\n$$']])
    expect(mathNodes('$$ e^{i\\pi} = -1 $$')).toEqual([['BlockMath', '$$ e^{i\\pi} = -1 $$']])
  })

  it('돈 표기처럼 $ 옆이 공백이거나 닫는 $ 뒤가 숫자면 수식이 아니다', () => {
    expect(mathNodes('가격은 $5 이고 할인가는 $3 이다')).toEqual([])
    expect(mathNodes('$ x$ 와 $x $')).toEqual([])
    expect(mathNodes('$5와 $10')).toEqual([])
  })

  it('\\$는 글자이고, 수식 안의 \\$에서는 닫지 않는다', () => {
    expect(mathNodes('\\$5 와 \\$10')).toEqual([])
    expect(mathNodes('$a\\$b$')).toEqual([['InlineMath', '$a\\$b$']])
  })

  it('코드 안의 $는 수식이 아니다', () => {
    expect(mathNodes('`$x$` 그대로')).toEqual([])
    expect(mathNodes('```\n$$\nx\n$$\n```')).toEqual([])
  })

  it('$$x$$ 뒤에 글이 있으면 문단 속 수식이다', () => {
    expect(mathNodes('$$x$$ 는 변수')).toEqual([['InlineMath', '$$x$$']])
  })

  it('블록 수식은 문단 바로 다음 줄에서도 시작한다', () => {
    expect(mathNodes('본문\n$$\nx\n$$\n끝')).toEqual([['BlockMath', '$$\nx\n$$']])
  })

  it('닫지 않은 $$는 뒤 내용을 삼키지 않고 그냥 문단이다', () => {
    expect(mathNodes('$$\nx\n\n# 제목\n\n- 목록\n')).toEqual([])
    expect(mathNodes('$$$ 할인\n다음 줄\n\n본문')).toEqual([])
  })

  it('빈 줄을 건너서는 닫지 않는다 (짝이 밀리지 않게)', () => {
    expect(mathNodes('$$\na\n\n$$\nb\n$$')).toEqual([['BlockMath', '$$\nb\n$$']])
  })

  it('여는 중인 블록 수식의 닫는 $$ 줄은 새 블록을 열지 않는다', () => {
    expect(mathNodes('$$\na\n$$\n$$\nb\n$$')).toEqual([
      ['BlockMath', '$$\na\n$$'],
      ['BlockMath', '$$\nb\n$$'],
    ])
  })

  it('4칸 들여쓴 $$ 줄은 문단을 끊지 않는다', () => {
    expect(mathNodes('본문\n    $$ 금액\nx\n$$')).toEqual([])
  })

  it('인용 안에서도 열고 닫는다', () => {
    expect(mathNodes('> $$\n> a^2\n> $$')).toEqual([['BlockMath', '$$\n> a^2\n> $$']])
  })
})

describe('줄 안 수식', () => {
  const doc = '넓이는 $\\pi r^2$ 이다\n다음 줄'

  it('커서가 닿지 않으면 그린 수식으로 바꾼다', () => {
    expect(inline(doc, doc.length).widgets).toEqual([['$\\pi r^2$', '\\pi r^2', false]])
  })

  it('커서가 닿으면 원문을 드러낸다', () => {
    const d = inline(doc, 6)
    expect(d.widgets).toEqual([])
    expect(d.sources).toEqual(['$\\pi r^2$'])
  })

  it('포커스가 없으면 커서가 있어도 그린다', () => {
    expect(inline(doc, 6, false).widgets).toHaveLength(1)
  })

  it('글 사이의 $$…$$은 디스플레이 스타일로, 줄 안 위젯으로 그린다', () => {
    expect(inline('$$x$$ 는 변수\n끝', 12).widgets).toEqual([['$$x$$', 'x', true]])
  })
})

describe('블록 수식', () => {
  const math = '$$\na^2 + b^2 = c^2\n$$'

  it('커서가 블록 밖이면 원문 줄들을 수식 하나로 바꾼다', () => {
    const doc = `${math}\n\n끝`
    expect(block(doc, doc.length)).toEqual({
      replaced: [[math, '\na^2 + b^2 = c^2\n']],
      previews: [],
      sourceLines: [],
    })
  })

  it('커서가 닿으면 원문을 드러내고 아래에 그린 모양을 보인다', () => {
    expect(block(`${math}\n\n끝`, 3)).toEqual({
      replaced: [],
      previews: ['\na^2 + b^2 = c^2\n'],
      sourceLines: [1, 2, 3],
    })
  })

  it('인용 안의 블록 수식은 원문과 그 아래 그린 모양을 함께 보인다 (> 기호는 수식에서 뺀다)', () => {
    const doc = '> $$\n> x\n> $$\n\n끝'
    expect(block(doc, doc.length)).toEqual({
      replaced: [],
      previews: ['\nx\n'],
      sourceLines: [1, 2, 3],
    })
  })
})

describe('표 안의 수식', () => {
  it('칸 안의 $…$은 수식으로 그린다', () => {
    const doc = '| 식 |\n|--|\n| $x^2$ |\n\n끝'
    const models: TableModel[] = []
    buildTableDecorations(stateOf(doc), true).between(0, doc.length, (_f, _t, deco) => {
      const widget = deco.spec.widget as { model?: TableModel } | undefined
      if (widget?.model) models.push(widget.model)
    })
    expect(models[0].rows[1]).toEqual([[{ tag: 'math', tex: 'x^2' }]])
  })
})

describe('renderMath', () => {
  it('KaTeX HTML을 만들고, 틀린 문법은 오류로 보인다 (던지지 않는다)', async () => {
    const katex = await loadKatex()
    expect(renderMath(katex, 'x^2', false)).toContain('class="katex"')
    expect(renderMath(katex, '\\frac{1}', false)).toContain('katex-error')
    expect(renderMath(katex, 'x', true)).toContain('katex-display')
  })
})
