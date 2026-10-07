// Live Preview (Figma W1-06, Obsidian Live Preview 참고)
// 마크다운 원문을 그대로 편집하면서 서식을 입혀 보여준다. 커서(선택)가 걸친 줄만 `##`, `**` 같은 원문 기호를 드러낸다.
// 저장되는 것은 언제나 마크다운 원문이다. 여기서는 보이는 모양만 바꾼다.
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view'

class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-lp-bullet'
    span.textContent = '•'
    return span
  }
}

/** 원문 기호를 숨긴다 */
const hide = Decoration.replace({})
/** 글머리표 `-`·`*`·`+`를 •로 바꿔 보여준다 */
const bullet = Decoration.replace({ widget: new BulletWidget() })
const mark = (cls: string) => Decoration.mark({ class: cls })
const line = (cls: string) => Decoration.line({ class: cls })

const INLINE_MARKS: Record<string, string> = {
  StrongEmphasis: 'cm-lp-strong',
  Emphasis: 'cm-lp-em',
  Strikethrough: 'cm-lp-strike',
  InlineCode: 'cm-lp-code',
  Link: 'cm-lp-link',
}

/** 커서·선택이 걸친 줄 번호 */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number
    const last = state.doc.lineAt(r.to).number
    for (let n = first; n <= last; n++) lines.add(n)
  }
  return lines
}

/**
 * from~to 범위의 Live Preview 장식을 만든다. 화면(EditorView) 없이 EditorState만으로 계산해 테스트할 수 있다.
 * focused가 false면(편집기에 포커스가 없으면) 커서 줄도 원문을 드러내지 않는다.
 */
export function buildDecorations(
  state: EditorState,
  { from = 0, to = state.doc.length, focused = true } = {},
): DecorationSet {
  const tree = ensureSyntaxTree(state, to, 200) ?? syntaxTree(state)
  const active = focused ? activeLines(state) : new Set<number>()
  const doc = state.doc
  const isActive = (pos: number) => active.has(doc.lineAt(pos).number)
  /** pos 바로 뒤가 공백이면 그 공백까지 (`## 제목`, `> 인용`의 기호 뒤 공백) */
  const withSpace = (end: number) => (doc.sliceString(end, end + 1) === ' ' ? end + 1 : end)
  const decos: Range<Decoration>[] = []
  /** 코드 블록 안의 줄 (빈 줄을 줄이지 않는다) */
  const codeLines = new Set<number>()

  tree.iterate({
    from,
    to,
    enter(node) {
      const name = node.name
      const parent = node.node.parent?.name

      const heading = /^ATXHeading([1-6])$/.exec(name)
      if (heading) {
        decos.push(
          line(`cm-lp-h${Math.min(Number(heading[1]), 4)}`).range(doc.lineAt(node.from).from),
        )
        return
      }

      if (name in INLINE_MARKS) {
        if (node.from < node.to) decos.push(mark(INLINE_MARKS[name]).range(node.from, node.to))
        return
      }

      switch (name) {
        case 'HeaderMark':
          if (!isActive(node.from)) decos.push(hide.range(node.from, withSpace(node.to)))
          return
        case 'EmphasisMark':
        case 'StrikethroughMark':
          if (!isActive(node.from)) decos.push(hide.range(node.from, node.to))
          return
        case 'CodeMark':
          if (parent === 'InlineCode' && !isActive(node.from)) {
            decos.push(hide.range(node.from, node.to))
          }
          return
        case 'LinkMark':
        case 'URL':
        case 'LinkTitle':
          if (parent === 'Link' && !isActive(node.from)) decos.push(hide.range(node.from, node.to))
          return
        case 'ListMark':
          // 번호 목록(1.)은 그대로 둔다 (W1-06)
          if (node.node.parent?.parent?.name === 'BulletList' && !isActive(node.from)) {
            decos.push(bullet.range(node.from, node.to))
          }
          return
        case 'QuoteMark':
          if (!isActive(node.from)) decos.push(hide.range(node.from, withSpace(node.to)))
          return
        case 'Blockquote':
          for (let pos = node.from; pos <= node.to;) {
            const l = doc.lineAt(pos)
            decos.push(line('cm-lp-quote').range(l.from))
            pos = l.to + 1
          }
          return
        case 'FencedCode':
          decorateFencedCode(node.from, node.to)
          return false
      }
    },
  })

  /** 코드 블록: 모든 줄에 배경. 커서가 블록 밖이면 ``` 줄은 글자를 숨기고 여백으로만 남긴다 */
  function decorateFencedCode(start: number, end: number) {
    const first = doc.lineAt(start)
    const last = doc.lineAt(end)
    let blockActive = false
    for (let n = first.number; n <= last.number; n++) if (active.has(n)) blockActive = true
    const closed = last.number > first.number && /^\s*(`{3,}|~{3,})/.test(last.text)

    for (let n = first.number; n <= last.number; n++) {
      codeLines.add(n)
      const l = doc.line(n)
      const isFence = n === first.number || (closed && n === last.number)
      const classes = ['cm-lp-codeblock']
      if (n === first.number) classes.push('cm-lp-code-top')
      if (n === last.number) classes.push('cm-lp-code-bottom')
      if (isFence && !blockActive) {
        classes.push('cm-lp-fence-hidden')
        if (l.from < l.to) decos.push(hide.range(l.from, l.to))
      }
      decos.push(line(classes.join(' ')).range(l.from))
    }
  }

  // 블록 사이 빈 줄은 절반 높이로 (W1-06 블록 간격 12). 커서가 오면 원래 높이
  const firstLine = doc.lineAt(from).number
  const lastLine = doc.lineAt(to).number
  for (let n = firstLine; n <= lastLine; n++) {
    const l = doc.line(n)
    if (l.length === 0 && !active.has(n) && !codeLines.has(n)) {
      decos.push(line('cm-lp-blank').range(l.from))
    }
  }

  return Decoration.set(decos, true)
}

function build(view: EditorView) {
  const { from, to } = view.viewport
  return buildDecorations(view.state, { from, to, focused: view.hasFocus })
}

/** 화면에 보이는 부분만 계산하고, 입력·커서 이동·스크롤·구문 분석 진행 때 다시 계산한다 */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.focusChanged ||
        syntaxTree(u.startState) !== syntaxTree(u.state)
      ) {
        this.decorations = build(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
