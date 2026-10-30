// 수식 미리보기 (KaTeX). Live Preview의 일부.
// - `$…$`은 줄 안 수식이다. 줄 안의 `$$…$$`은 큰 수식(디스플레이 스타일)으로 글 사이에 보인다.
// - 줄 맨 앞 `$$`로 열고 `$$`로 끝나는 줄에서 닫으면 블록 수식이다 (한 줄 `$$ x $$`도 블록).
//   빈 줄 없이 이어진 줄 안에서 닫아야 하고, 닫지 않으면 그냥 문단이다 (뒤 내용을 삼키지 않게).
// - `$5와 $10`처럼 여는 `$` 뒤나 닫는 `$` 앞이 공백이거나, 닫는 `$` 뒤가 숫자면 수식이 아니다 (Pandoc 규칙). `\$`는 글자 $다.
// 줄 안 수식은 livePreview.ts가, 여러 줄을 덮는 블록 수식은 여기의 StateField가 그린다 (tablePreview.ts와 같은 이유).
// 커서가 닿으면 원문을 드러내고, 블록 수식은 그 아래에 그린 모양을 함께 보인다. 인용·목록 안의 블록 수식은
// 줄 앞 기호 때문에 바꿔 그릴 수 없어 언제나 원문과 그 아래 그린 모양을 함께 보인다. 저장되는 것은 언제나 원문이다.
// KaTeX는 수식을 처음 그릴 때 불러온다 (수식 없는 노트는 받지 않는다).
import { syntaxTree } from '@codemirror/language'
import { StateField, type EditorState, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type {
  BlockContext,
  LeafBlock,
  LeafBlockParser,
  Line,
  MarkdownConfig,
} from '@lezer/markdown'
import type Katex from 'katex'
import { focusedField, focusTracking, selectionTouches } from './editorFocus'

const DOLLAR = 36
const BACKSLASH = 92

const isSpace = (ch: number) => ch === 32 || ch === 9 || ch === 10 || ch === 13
const isDigit = (ch: number) => ch >= 48 && ch <= 57

/** 블록 수식 끝 줄인지 (`$$`로 끝난다) */
const closesBlock = (text: string) => text.trimEnd().endsWith('$$')

/** Line.depth는 타입에 없지만 FencedCode·SetextHeading처럼 감싼 인용·목록이 끝났는지 볼 때 쓴다 */
const lineDepth = (line: Line) => (line as Line & { depth: number }).depth

/** `$$`로 시작하는 줄의 나머지가 같은 줄에서 닫힌 한 줄 블록(`$$ x $$`)인지, 여는 줄(`$$`, `$$ x`)인지 */
function blockStart(line: Line): 'single' | 'open' | null {
  // 4칸 들여쓴 줄은 코드 블록이거나 문단의 이어진 줄이다
  if (line.indent - line.baseIndent >= 4) return null
  const text = line.text.slice(line.pos)
  if (!text.startsWith('$$')) return null
  const rest = text.slice(2)
  if (!rest.includes('$$')) return 'open'
  // `$$x$$ 뒤에 글`은 문단 속 수식이다
  return closesBlock(rest) && rest.trim().length > 2 ? 'single' : null
}

/**
 * 여러 줄 블록 수식. 여는 줄은 문단(leaf)으로 시작하고, 이어진 줄에서 `$$`로 닫으면 블록 수식으로 바꾼다.
 * 빈 줄이나 다른 블록(제목·목록 등)이 먼저 오면 finish에서 false를 돌려 그냥 문단으로 둔다.
 */
class BlockMathParser implements LeafBlockParser {
  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock) {
    if (lineDepth(line) < cx.depth || !closesBlock(line.text.slice(line.pos))) return false
    const end = cx.lineStart + line.text.trimEnd().length
    const children = [
      cx.elt('BlockMathMark', leaf.start, leaf.start + 2),
      ...line.markers,
      cx.elt('BlockMathMark', end - 2, end),
    ]
    cx.nextLine()
    cx.addLeafElement(leaf, cx.elt('BlockMath', leaf.start, cx.prevLineEnd(), children))
    return true
  }
  finish() {
    return false
  }
}

/** 마크다운 파서에 수식 문법(InlineMath, BlockMath)을 더한다 */
export const mathSyntax: MarkdownConfig = {
  defineNodes: [
    { name: 'InlineMath' },
    { name: 'InlineMathMark' },
    { name: 'BlockMath', block: true },
    { name: 'BlockMathMark' },
  ],
  parseInline: [
    {
      name: 'InlineMath',
      parse(cx, next, pos) {
        if (next !== DOLLAR) return -1
        const double = cx.char(pos + 1) === DOLLAR
        const start = pos + (double ? 2 : 1)
        if (start >= cx.end || (!double && isSpace(cx.char(start)))) return -1
        for (let i = start; i < cx.end; i++) {
          const ch = cx.char(i)
          if (ch === BACKSLASH) {
            i++
            continue
          }
          if (ch !== DOLLAR) continue
          if (double) {
            if (cx.char(i + 1) !== DOLLAR || i === start) continue
            return cx.addElement(
              cx.elt('InlineMath', pos, i + 2, [
                cx.elt('InlineMathMark', pos, start),
                cx.elt('InlineMathMark', i, i + 2),
              ]),
            )
          }
          if (isSpace(cx.char(i - 1)) || isDigit(cx.char(i + 1))) continue
          return cx.addElement(
            cx.elt('InlineMath', pos, i + 1, [
              cx.elt('InlineMathMark', pos, start),
              cx.elt('InlineMathMark', i, i + 1),
            ]),
          )
        }
        return -1
      },
      after: 'InlineCode',
    },
  ],
  parseBlock: [
    {
      name: 'BlockMath',
      // 한 줄 `$$ x $$`은 바로 블록으로
      parse(cx, line) {
        if (blockStart(line) !== 'single') return false
        const from = cx.lineStart + line.pos
        const end = cx.lineStart + line.text.trimEnd().length
        cx.nextLine()
        cx.addElement(
          cx.elt('BlockMath', from, end, [
            cx.elt('BlockMathMark', from, from + 2),
            cx.elt('BlockMathMark', end - 2, end),
          ]),
        )
        return true
      },
      leaf: (_cx, leaf) =>
        /^\$\$(?![\s\S]*\$\$)/.test(leaf.content) ? new BlockMathParser() : null,
      // 문단 바로 다음 줄에서도 시작한다. 여는 중인 블록 수식 안에서는 닫는 `$$` 줄이 새로 열지 않게 한다
      endLeaf: (_cx, line, leaf) =>
        blockStart(line) !== null && !leaf.parsers.some((p) => p instanceof BlockMathParser),
      before: 'FencedCode',
    },
  ],
}

/** 수식 노드(InlineMath·BlockMath)의 기호를 뺀 원문. 인용 안이면 줄 앞 `>`(뒤 공백까지)도 뺀다 */
export function mathSource(state: EditorState, math: SyntaxNode): string {
  const marks = math.getChildren(math.name === 'InlineMath' ? 'InlineMathMark' : 'BlockMathMark')
  const open = marks[0]
  const close = marks.length > 1 ? marks[marks.length - 1] : null
  const end = close ? close.from : math.to
  let pos = open ? open.to : math.from
  let out = ''
  for (const quote of math.getChildren('QuoteMark')) {
    if (quote.from < pos || quote.to > end) continue
    out += state.sliceDoc(pos, quote.from)
    pos = state.sliceDoc(quote.to, quote.to + 1) === ' ' ? quote.to + 1 : quote.to
  }
  return out + state.sliceDoc(pos, end)
}

type KatexModule = typeof Katex
let katex: KatexModule | null = null
let katexLoading: Promise<KatexModule> | null = null

/** KaTeX와 그 CSS를 한 번만 불러온다 */
export function loadKatex(): Promise<KatexModule> {
  katexLoading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([mod]) => (katex = mod.default),
  )
  return katexLoading
}

/** 수식 원문(기호 뺀 것)을 KaTeX HTML로. 문법이 틀리면 원문을 빨갛게 보인다 */
export function renderMath(lib: KatexModule, tex: string, display: boolean): string {
  return lib.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    // 수식 안 한글 등에 경고를 내지 않는다
    strict: 'ignore',
  })
}

/**
 * 그린 수식 요소. block이면 줄 하나를 차지하는 div, 아니면 글 사이의 span이다.
 * KaTeX를 아직 못 불러왔으면 원문을 흐리게 보이다가 불러오면 바꾸고 높이를 다시 잰다.
 */
export function mathElement(
  view: EditorView,
  tex: string,
  { display, block }: { display: boolean; block: boolean },
): HTMLElement {
  const el = document.createElement(block ? 'div' : 'span')
  el.className = block ? 'cm-lp-math cm-lp-math-block' : 'cm-lp-math'
  if (display && !block) el.classList.add('cm-lp-math-inline-display')
  if (tex.trim() === '') {
    el.classList.add('cm-lp-math-empty')
    el.textContent = '빈 수식'
  } else if (katex) {
    el.innerHTML = renderMath(katex, tex, display)
  } else {
    el.classList.add('cm-lp-math-loading')
    el.textContent = tex
    void loadKatex().then((lib) => {
      el.classList.remove('cm-lp-math-loading')
      el.innerHTML = renderMath(lib, tex, display)
      view.requestMeasure()
    })
  }
  return el
}

/** 그린 수식. 누르면 편집기가 커서를 원문으로 옮긴다 */
export class MathWidget extends WidgetType {
  readonly tex: string
  /** KaTeX 디스플레이 스타일 (`$$`) */
  readonly display: boolean
  /** 줄 하나를 차지하는 블록 수식 */
  readonly block: boolean
  constructor(tex: string, display: boolean, block: boolean) {
    super()
    this.tex = tex
    this.display = display
    this.block = block
  }
  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display && other.block === this.block
  }
  toDOM(view: EditorView) {
    return mathElement(view, this.tex, { display: this.display, block: this.block })
  }
  ignoreEvent() {
    return false
  }
}

/** 이 안에는 블록 수식이 없으므로 들어가지 않는다 */
const NO_BLOCK_MATH =
  /^(Paragraph|FencedCode|CodeBlock|HTMLBlock|Table|ATXHeading\d|SetextHeading\d)$/

interface MathBlock {
  from: number
  to: number
  /** 줄 전체를 차지해 바꿔 그릴 수 있는지 (인용·목록 안이면 원문과 그린 모양을 함께 보인다) */
  ownsLines: boolean
}

interface MathState {
  blocks: MathBlock[]
  decorations: DecorationSet
}

function computeMath(state: EditorState, focused: boolean): MathState {
  const decos: Range<Decoration>[] = []
  const blocks: MathBlock[] = []
  const doc = state.doc
  syntaxTree(state).iterate({
    enter(node) {
      if (NO_BLOCK_MATH.test(node.name)) return false
      if (node.name !== 'BlockMath') return
      const first = doc.lineAt(node.from)
      const last = doc.lineAt(node.to)
      const block: MathBlock = {
        from: first.from,
        to: last.to,
        ownsLines:
          doc.sliceString(first.from, node.from).trim() === '' &&
          doc.sliceString(node.to, last.to).trim() === '',
      }
      blocks.push(block)
      const widget = new MathWidget(mathSource(state, node.node), true, true)
      if (block.ownsLines && !selectionTouches(state.selection, focused, block)) {
        decos.push(Decoration.replace({ widget, block: true }).range(block.from, block.to))
      } else {
        // 원문은 고정폭으로 드러내고, 고치는 대로 아래에 그린 모양을 보인다
        for (let n = first.number; n <= last.number; n++) {
          decos.push(Decoration.line({ class: 'cm-lp-math-src' }).range(doc.line(n).from))
        }
        decos.push(Decoration.widget({ widget, block: true, side: 1 }).range(block.to))
      }
      return false
    },
  })
  return { blocks, decorations: Decoration.set(decos, true) }
}

/** 블록 수식 장식. 화면 없이 EditorState만으로 계산해 테스트할 수 있다 */
export function buildMathDecorations(state: EditorState, focused: boolean): DecorationSet {
  return computeMath(state, focused).decorations
}

/** 커서만 움직였을 때는 어느 블록의 "닿음"이 바뀐 경우에만 다시 만든다 */
const mathField = StateField.define<MathState>({
  create: (state) => computeMath(state, false),
  update(value, tr) {
    const focused = tr.state.field(focusedField)
    if (tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return computeMath(tr.state, focused)
    }
    const wasFocused = tr.startState.field(focusedField)
    const changed = value.blocks.some(
      (b) =>
        b.ownsLines &&
        selectionTouches(tr.startState.selection, wasFocused, b) !==
          selectionTouches(tr.state.selection, focused, b),
    )
    return changed ? computeMath(tr.state, focused) : value
  },
  provide: (f) => EditorView.decorations.from(f, (value) => value.decorations),
})

/** KaTeX 글꼴이 늦게 들어오면 수식 높이가 바뀌므로 글꼴을 받을 때마다 다시 잰다 (표 칸 속 수식 포함) */
const remeasureOnFontLoad = ViewPlugin.define((view) => {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  const remeasure = () => view.requestMeasure()
  fonts?.addEventListener('loadingdone', remeasure)
  return { destroy: () => fonts?.removeEventListener('loadingdone', remeasure) }
})

/** 포커스가 없으면 커서가 블록 안이어도 그려 보인다 (editorFocus.ts) */
export const mathPreview = [focusTracking, mathField, remeasureOnFontLoad]
