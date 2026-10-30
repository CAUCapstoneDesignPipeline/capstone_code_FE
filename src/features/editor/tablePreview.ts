// 표 미리보기 (GFM 표). Live Preview의 일부.
// 커서가 표 밖이면 `| a | b |` 원문 줄들을 표 하나로 바꿔 그린다. 커서가 표에 닿으면(누르거나 화살표로 들어가면)
// 원문을 고정폭 글꼴로 드러내 칸을 맞춰 고칠 수 있게 한다. 저장되는 것은 언제나 원문이다.
// 여러 줄을 덮는 장식은 ViewPlugin이 아니라 StateField로만 줄 수 있어서 livePreview.ts와 따로 둔다.
import { syntaxTree } from '@codemirror/language'
import { StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { focusedField, focusTracking, selectionTouches } from './editorFocus'
import { mathElement, mathSource } from './mathPreview'

export type CellAlign = 'left' | 'center' | 'right' | null

/** 칸 안의 글. 굵게·기울임·취소선·코드·링크·수식만 모양을 살리고 나머지는 글자로 둔다 */
export type InlinePart =
  | string
  | { tag: 'strong' | 'em' | 'del' | 'code' | 'link'; children: InlinePart[] }
  | { tag: 'math'; tex: string }

export interface TableModel {
  align: CellAlign[]
  /** 첫 줄이 머리글. 줄마다 칸 수는 머리글에 맞춘다 */
  rows: InlinePart[][][]
}

const INLINE_TAGS: Record<string, 'strong' | 'em' | 'del' | 'code' | 'link'> = {
  StrongEmphasis: 'strong',
  Emphasis: 'em',
  Strikethrough: 'del',
  InlineCode: 'code',
  Link: 'link',
}

/** 칸 글에서 빼는 기호·주소 */
const SKIP = new Set([
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
  'LinkLabel',
  'URL',
  'LinkTitle',
])

function inlineParts(state: EditorState, node: SyntaxNode, from: number, to: number): InlinePart[] {
  const out: InlinePart[] = []
  let pos = from
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from > pos) out.push(state.sliceDoc(pos, child.from))
    const tag = INLINE_TAGS[child.name]
    if (tag) out.push({ tag, children: inlineParts(state, child, child.from, child.to) })
    else if (child.name === 'InlineMath') out.push({ tag: 'math', tex: mathSource(state, child) })
    else if (child.name === 'Escape') out.push(state.sliceDoc(child.from + 1, child.to))
    else if (child.name === 'Image') out.push(...inlineParts(state, child, child.from, child.to))
    else if (!SKIP.has(child.name)) out.push(state.sliceDoc(child.from, child.to))
    pos = child.to
  }
  if (to > pos) out.push(state.sliceDoc(pos, to))
  return out
}

/** 구분 줄(`|:--|--:|`)에서 칸마다 정렬 */
function parseAlign(text: string): CellAlign[] {
  return text
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((spec) => {
      const s = spec.trim()
      const left = s.startsWith(':')
      const right = s.endsWith(':')
      return left && right ? 'center' : right ? 'right' : left ? 'left' : null
    })
}

/** 한 줄의 칸들. 빈 칸(`|  |`)에는 TableCell 노드가 없어서 구분자(|) 사이를 센다 */
function rowCells(row: SyntaxNode): (SyntaxNode | null)[] {
  const cells: (SyntaxNode | null)[] = []
  let current: SyntaxNode | null = null
  let started = false
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter') {
      if (started) cells.push(current)
      current = null
      started = true
    } else if (child.name === 'TableCell') {
      current = child
      started = true
    }
  }
  if (current) cells.push(current)
  return cells
}

export function parseTable(state: EditorState, table: SyntaxNode): TableModel {
  let align: CellAlign[] = []
  const rows: InlinePart[][][] = []
  for (let child = table.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter') {
      align = parseAlign(state.sliceDoc(child.from, child.to))
    } else if (child.name === 'TableHeader' || child.name === 'TableRow') {
      rows.push(
        rowCells(child).map((cell) => (cell ? inlineParts(state, cell, cell.from, cell.to) : [])),
      )
    }
  }
  const width = rows[0]?.length ?? 0
  return {
    align: Array.from({ length: width }, (_, i) => align[i] ?? null),
    rows: rows.map((cells) => Array.from({ length: width }, (_, i) => cells[i] ?? [])),
  }
}

function renderParts(view: EditorView, parent: HTMLElement, parts: InlinePart[]) {
  for (const part of parts) {
    if (typeof part === 'string') {
      parent.append(part)
      continue
    }
    if (part.tag === 'math') {
      parent.append(mathElement(view, part.tex, { display: false, block: false }))
      continue
    }
    // 링크는 편집 중 누르면 원문으로 들어가야 하므로 <a>가 아니라 모양만 입힌다
    const el = document.createElement(part.tag === 'link' ? 'span' : part.tag)
    el.className = `cm-lp-${part.tag === 'link' ? 'link' : part.tag}`
    renderParts(view, el, part.children)
    parent.append(el)
  }
}

/** 원문 표 대신 보이는 표. 누르면 편집기가 커서를 표 원문으로 옮긴다 */
class TableWidget extends WidgetType {
  readonly model: TableModel
  /** 이 표의 원문. 원문이 같으면 같은 표다 */
  readonly source: string
  constructor(model: TableModel, source: string) {
    super()
    this.model = model
    this.source = source
  }
  eq(other: TableWidget) {
    return other.source === this.source
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-lp-table-wrap'
    const table = document.createElement('table')
    table.className = 'cm-lp-table'
    const [header, ...body] = this.model.rows
    const addRow = (section: HTMLElement, cells: InlinePart[][], tag: 'th' | 'td') => {
      const tr = document.createElement('tr')
      cells.forEach((parts, i) => {
        const cell = document.createElement(tag)
        const align = this.model.align[i]
        if (align) cell.style.textAlign = align
        renderParts(view, cell, parts)
        tr.append(cell)
      })
      section.append(tr)
    }
    const thead = document.createElement('thead')
    if (header) addRow(thead, header, 'th')
    const tbody = document.createElement('tbody')
    for (const cells of body) addRow(tbody, cells, 'td')
    table.append(thead, tbody)
    wrap.append(table)
    return wrap
  }
  ignoreEvent() {
    return false
  }
}

/** 이 안에는 표가 없으므로 들어가지 않는다 */
const NO_TABLES = /^(Paragraph|FencedCode|CodeBlock|HTMLBlock|ATXHeading\d|SetextHeading\d)$/

/** 문서 속 표 하나 (원문 줄 범위). 표로 그린 것만 widget이 있다 */
interface TableBlock {
  from: number
  to: number
  /** 줄 전체를 차지해 표로 그릴 수 있는지 */
  ownsLines: boolean
  widget: TableWidget | null
}

interface TablesState {
  blocks: TableBlock[]
  decorations: DecorationSet
}

/**
 * 표를 찾아 장식을 만든다. 원문이 같은 표는 앞 결과(reuse)의 위젯을 그대로 써서 다시 분석하지 않는다.
 * 줄 전체를 차지하는 표만 바꿔 그린다 (목록·인용 안의 표는 줄 앞에 기호가 있어 원문으로 둔다).
 */
function computeTables(
  state: EditorState,
  focused: boolean,
  reuse?: ReadonlyMap<string, TableWidget>,
): TablesState {
  const decos: Range<Decoration>[] = []
  const blocks: TableBlock[] = []
  const doc = state.doc
  syntaxTree(state).iterate({
    enter(node) {
      if (NO_TABLES.test(node.name)) return false
      if (node.name !== 'Table') return
      const first = doc.lineAt(node.from)
      const last = doc.lineAt(node.to)
      const block: TableBlock = {
        from: first.from,
        to: last.to,
        ownsLines:
          doc.sliceString(first.from, node.from).trim() === '' &&
          doc.sliceString(node.to, last.to).trim() === '',
        widget: null,
      }
      if (!block.ownsLines || selectionTouches(state.selection, focused, block)) {
        for (let n = first.number; n <= last.number; n++) {
          decos.push(Decoration.line({ class: 'cm-lp-table-src' }).range(doc.line(n).from))
        }
      } else {
        const source = doc.sliceString(block.from, block.to)
        block.widget = reuse?.get(source) ?? new TableWidget(parseTable(state, node.node), source)
        decos.push(
          Decoration.replace({ widget: block.widget, block: true }).range(block.from, block.to),
        )
      }
      blocks.push(block)
      return false
    },
  })
  return { blocks, decorations: Decoration.set(decos, true) }
}

/** 표 장식. 화면 없이 EditorState만으로 계산해 테스트할 수 있다 */
export function buildTableDecorations(state: EditorState, focused: boolean): DecorationSet {
  return computeTables(state, focused).decorations
}

/**
 * 커서만 움직였을 때는 어느 표의 "닿음"이 바뀐 경우에만 다시 만든다.
 * 글을 고치면 다시 찾되, 원문이 그대로인 표는 위젯을 재사용한다.
 */
const tableField = StateField.define<TablesState>({
  create: (state) => computeTables(state, false),
  update(value, tr) {
    const focused = tr.state.field(focusedField)
    const reuse = () =>
      new Map(value.blocks.flatMap((b) => (b.widget ? [[b.widget.source, b.widget] as const] : [])))
    if (tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return computeTables(tr.state, focused, reuse())
    }
    const wasFocused = tr.startState.field(focusedField)
    const changed = value.blocks.some(
      (b) =>
        b.ownsLines &&
        selectionTouches(tr.startState.selection, wasFocused, b) !==
          selectionTouches(tr.state.selection, focused, b),
    )
    return changed ? computeTables(tr.state, focused, reuse()) : value
  },
  provide: (f) => EditorView.decorations.from(f, (value) => value.decorations),
})

export const tablePreview = [focusTracking, tableField]

/** 지금 표 장식 (테스트와 확인용) */
export function tableDecorations(state: EditorState): DecorationSet {
  return state.field(tableField).decorations
}
