// Live Preview (Figma W1-06, Notion 편집 감각 참고)
// 마크다운 원문을 그대로 편집하면서 서식을 입혀 보여준다.
// - 줄 앞 기호(`##`, `-`, `>`, `- [ ]`)는 늘 숨긴다. 뒤에 글자가 없는 줄을 쓰는 중일 때만 드러낸다 (`## ` 입력 직후).
//   숨긴 기호는 한 덩어리(atomic)라 커서가 건너뛰고, 글 맨 앞에서 Backspace를 누르면 통째로 지워져 본문이 된다.
// - 줄 안 기호(`**`, `` ` ``, 링크)는 커서가 그 서식에 닿아 있을 때만 드러낸다. 같은 줄의 다른 서식은 그대로 둔다.
// 저장되는 것은 언제나 마크다운 원문이다. 여기서는 보이는 모양만 바꾼다.
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, type EditorState, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
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

/** `- [ ]` 할 일 체크박스. 누르면 원문의 `[ ]`·`[x]`를 바꾼다 */
class CheckboxWidget extends WidgetType {
  readonly checked: boolean
  constructor(checked: boolean) {
    super()
    this.checked = checked
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-lp-checkbox'
    box.checked = this.checked
    box.tabIndex = -1
    box.setAttribute('aria-label', this.checked ? '완료한 할 일' : '할 일')
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('click', (e) => {
      e.preventDefault()
      const pos = view.posAtDOM(box)
      if (!/^\[[ xX]\]$/.test(view.state.doc.sliceString(pos, pos + 3))) return
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: this.checked ? ' ' : 'x' } })
    })
    return box
  }
  ignoreEvent() {
    return true
  }
}

/** 원문 기호를 숨긴다 */
const hide = Decoration.replace({})
/** 글머리표 `-`·`*`·`+`를 •로 바꿔 보여준다 */
const bullet = Decoration.replace({ widget: new BulletWidget() })
const checkbox = (checked: boolean) => Decoration.replace({ widget: new CheckboxWidget(checked) })
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
 * focused가 false면(편집기에 포커스가 없으면) 커서가 있어도 원문 기호를 드러내지 않는다.
 */
export function buildDecorations(
  state: EditorState,
  { from = 0, to = state.doc.length, focused = true } = {},
): DecorationSet {
  const tree = ensureSyntaxTree(state, to, 200) ?? syntaxTree(state)
  const active = focused ? activeLines(state) : new Set<number>()
  const doc = state.doc
  const decos: Range<Decoration>[] = []
  /** 코드 블록 안의 줄 (빈 줄을 줄이지 않는다) */
  const codeLines = new Set<number>()

  /** 커서·선택이 start~end에 닿아 있는지 (양 끝 포함) */
  const touches = (start: number, end: number) =>
    focused && state.selection.ranges.some((r) => r.from <= end && r.to >= start)
  /** pos 바로 뒤가 공백이면 그 공백까지 (`## 제목`, `> 인용`의 기호 뒤 공백) */
  const withSpace = (end: number) => (doc.sliceString(end, end + 1) === ' ' ? end + 1 : end)
  /** 줄 앞 기호를 드러낼지: 커서가 있는 줄인데 기호 뒤에 아직 쓴 글이 없을 때만 (`## ` 입력 중) */
  const writingMark = (end: number) => {
    const l = doc.lineAt(end)
    return active.has(l.number) && doc.sliceString(end, l.to).trim() === ''
  }
  /** 줄 앞 기호(뒤 공백까지)를 숨기거나 deco로 바꿔 그린다. 쓰는 중이면 그대로 둔다 */
  const replaceBlockMark = (start: number, end: number, deco: Decoration = hide) => {
    const until = withSpace(end)
    if (!writingMark(until)) decos.push(deco.range(start, until))
  }

  tree.iterate({
    from,
    to,
    enter(node) {
      const name = node.name
      const parentNode = node.node.parent

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
        case 'HeaderMark': {
          const l = doc.lineAt(node.from)
          if (doc.sliceString(l.from, node.from).trim() === '') {
            replaceBlockMark(node.from, node.to)
          } else if (!active.has(l.number)) {
            // 닫는 `##`(`## 제목 ##`)은 앞 공백까지 숨긴다
            const start =
              doc.sliceString(node.from - 1, node.from) === ' ' ? node.from - 1 : node.from
            decos.push(hide.range(start, node.to))
          }
          return
        }
        case 'EmphasisMark':
        case 'StrikethroughMark':
        case 'CodeMark':
        case 'LinkMark':
        case 'URL':
        case 'LinkTitle':
          // 커서가 닿은 서식 하나만 기호를 드러낸다
          if (parentNode && parentNode.name in INLINE_MARKS) {
            if (!touches(parentNode.from, parentNode.to)) decos.push(hide.range(node.from, node.to))
          }
          return
        case 'ListMark':
          // 번호 목록(1.)은 그대로 둔다 (W1-06)
          if (parentNode?.parent?.name !== 'BulletList') return
          if (parentNode.getChild('Task')) replaceBlockMark(node.from, node.to)
          else if (!writingMark(withSpace(node.to))) decos.push(bullet.range(node.from, node.to))
          return
        case 'TaskMarker': {
          const checked = /x/i.test(doc.sliceString(node.from, node.to))
          replaceBlockMark(node.from, node.to, checkbox(checked))
          if (checked) decos.push(line('cm-lp-task-done').range(doc.lineAt(node.from).from))
          return
        }
        case 'QuoteMark':
          replaceBlockMark(node.from, node.to)
          return
        case 'Blockquote':
          for (let pos = node.from; pos <= node.to;) {
            const l = doc.lineAt(pos)
            decos.push(line('cm-lp-quote').range(l.from))
            pos = l.to + 1
          }
          return
        case 'HorizontalRule': {
          // `---`은 구분선으로. 커서가 그 줄에 오면 원문
          const l = doc.lineAt(node.from)
          if (active.has(l.number)) return
          decos.push(line('cm-lp-hr').range(l.from))
          decos.push(hide.range(node.from, node.to))
          return
        }
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

/** 숨기거나 바꿔 그린 범위만 골라낸다. 커서는 이 안에 들어가지 않고, Backspace·Delete는 통째로 지운다 */
export function atomicRanges(decorations: DecorationSet): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const it = decorations.iter(); it.value; it.next()) {
    if (it.from < it.to && !(it.value.spec as { class?: string }).class) {
      builder.add(it.from, it.to, it.value)
    }
  }
  return builder.finish()
}

/** 화면에 보이는 부분만 계산하고, 입력·커서 이동·스크롤·구문 분석 진행 때 다시 계산한다 */
const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    atomic: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
      this.atomic = atomicRanges(this.decorations)
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
        this.atomic = atomicRanges(this.decorations)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

function build(view: EditorView) {
  const { from, to } = view.viewport
  return buildDecorations(view.state, { from, to, focused: view.hasFocus })
}

export const livePreview = [
  livePreviewPlugin,
  EditorView.atomicRanges.of((view) => view.plugin(livePreviewPlugin)?.atomic ?? Decoration.none),
]
