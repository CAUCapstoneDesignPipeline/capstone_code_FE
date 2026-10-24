// 붙여넣기 (Notion 편집 감각 참고)
// - 웹·Notion·Google Docs에서 서식 있는 글(HTML)을 붙이면 마크다운으로 바꿔 넣는다.
// - 글을 고른 채 주소 하나를 붙이면 `[고른 글](주소)` 링크로 만든다.
// - 코드 블록·인라인 코드 안이거나, 서식이 없는 HTML(편집기·터미널에서 복사)이면 원래대로 글자만 넣는다.
import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import TurndownService from 'turndown'

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
})
turndown.remove(['head', 'meta', 'title', 'style', 'script'])

/**
 * 글자 그대로여야 할 기호만 \로 막는다. 기본 escape는 `_`·`[`·`]`까지 막아 `snake\_case`·`\[opts\]`처럼
 * 원문이 지저분해진다. 단어 안 `_`나 짝 없는 `[ ]`는 마크다운에서도 글자 그대로라 둔다.
 * 줄 앞 블록 기호(`# `, `- `, `1. `, `>` …)와 서식이 되기 쉬운 `*`·`` ` ``만 막는다.
 */
const ESCAPES: [RegExp, string][] = [
  [/[*`]/g, '\\$&'],
  [/^(#{1,6}) /gm, '\\$1 '],
  [/^([-+>])/gm, '\\$1'],
  [/^(=+)/gm, '\\$1'],
  [/^~~~/gm, '\\~~~'],
  [/^(\d+)\. /gm, '$1\\. '],
]
turndown.escape = (text) => ESCAPES.reduce((out, [re, to]) => out.replace(re, to), text)

/** CSS 한 속성 값 (Google Docs는 굵게·기울임을 style로 준다) */
const styleOf = (node: HTMLElement, prop: string) =>
  new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i')
    .exec(node.getAttribute('style') ?? '')?.[1]
    ?.trim()

/** 내용 앞뒤 공백은 기호 밖으로 뺀다 (`** 굵게**`는 굵게가 아니다) */
function wrap(content: string, mark: string) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(content)!
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : content
}

turndown.addRule('googleDocsWrapper', {
  // Google Docs는 전체를 <b style="font-weight:normal">로 감싼다
  filter: (node) => node.nodeName === 'B' && styleOf(node, 'font-weight') === 'normal',
  replacement: (content) => content,
})

turndown.addRule('styledSpan', {
  filter: (node) => {
    if (node.nodeName !== 'SPAN') return false
    const weight = styleOf(node, 'font-weight')
    return weight === 'bold' || Number(weight) >= 600 || styleOf(node, 'font-style') === 'italic'
  },
  replacement: (content, node) => {
    const el = node as HTMLElement
    const weight = styleOf(el, 'font-weight')
    let out = content
    if (styleOf(el, 'font-style') === 'italic') out = wrap(out, '*')
    if (weight === 'bold' || Number(weight) >= 600) out = wrap(out, '**')
    return out
  },
})

turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => wrap(content, '~~'),
})

turndown.addRule('taskCheckbox', {
  filter: (node) => node.nodeName === 'INPUT' && node.getAttribute('type') === 'checkbox',
  replacement: (_content, node) =>
    (node as HTMLInputElement).hasAttribute('checked') ? '[x] ' : '[ ] ',
})

// 기본 규칙은 `-   항목`(공백 셋)이고 하위 목록을 4칸 들여쓴다. 편집기에서 쓰는 `- 항목`·기호 너비 들여쓰기로 맞춘다.
turndown.addRule('listItem', {
  filter: 'li',
  replacement: (content, node) => {
    const parent = node.parentNode as HTMLElement | null
    let prefix = '- '
    if (parent?.nodeName === 'OL') {
      const start = Number(parent.getAttribute('start') ?? 1)
      prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `
    }
    const body = content
      .replace(/^\n+/, '')
      // 체크박스 뒤 원래 공백과 겹친 공백은 하나로
      .replace(/^(\[[ x]\]) +/, '$1 ')
      .replace(/\n+$/, '\n')
      .replace(/\n/gm, `\n${' '.repeat(prefix.length)}`)
    return prefix + body + (node.nextSibling && !body.endsWith('\n') ? '\n' : '')
  },
})

turndown.addRule('codeBlock', {
  // <pre> 안의 글을 그대로 (기본 규칙은 <pre><code>만 잡는다). 언어는 class의 language-xxx에서
  filter: 'pre',
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const code = el.querySelector('code')
    const lang =
      /(?:^|\s)(?:lang|language)-(\S+)/.exec(`${code?.className ?? ''} ${el.className}`)?.[1] ?? ''
    const text = (el.textContent ?? '').replace(/\n$/, '')
    const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length))
    const fence = '`'.repeat(longest + 1)
    return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`
  },
})

turndown.addRule('image', {
  // http(s) 주소만 남긴다. data: 그림(붙여넣기 때 자주 딸려 온다)은 원문을 수 MB로 불리므로 alt 글만
  filter: 'img',
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const alt = (el.getAttribute('alt') ?? '').replace(/[[\]]/g, '')
    const src = el.getAttribute('src') ?? ''
    if (!/^https?:\/\//i.test(src)) return alt
    // 괄호·공백은 링크 문법을 끊으므로 %XX로 (encodeURIComponent는 괄호를 그대로 둔다)
    const url = src.replace(
      /[()\s]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
    )
    return `![${alt}](${url})`
  },
})

/** el을 품은 가장 가까운 <table> */
function ownerTable(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) if (p.nodeName === 'TABLE') return p
  return null
}

/** 칸 하나를 한 줄 마크다운으로. 칸 안의 표는 글자만 남긴다 (GFM 표는 겹칠 수 없다) */
function cellMarkdown(cell: HTMLElement): string {
  const copy = cell.cloneNode(true) as HTMLElement
  for (const inner of Array.from(copy.querySelectorAll('table'))) {
    if (!copy.contains(inner)) continue
    const text = (inner.textContent ?? '').replace(/\s+/g, ' ').trim()
    inner.parentNode?.replaceChild(copy.ownerDocument.createTextNode(` ${text} `), inner)
  }
  return turndown
    .turndown(copy.innerHTML)
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
}

turndown.addRule('table', {
  // 첫 줄을 머리글로 하는 GFM 표. 칸 안의 줄바꿈은 공백으로, |는 \|로
  filter: 'table',
  replacement: (_content, node) => {
    const table = node as HTMLElement
    // 칸 안에 표가 또 있으면(메일·레이아웃 HTML) 그 줄은 빼고 이 표의 줄만
    const rows = Array.from(table.querySelectorAll('tr')).filter((tr) => ownerTable(tr) === table)
    const cellsOf = (tr: Element) =>
      Array.from(tr.children).filter(
        (cell) => cell.nodeName === 'TH' || cell.nodeName === 'TD',
      ) as HTMLElement[]
    const grid = rows.map((tr) => cellsOf(tr).map(cellMarkdown))
    const width = Math.max(0, ...grid.map((cells) => cells.length))
    if (width === 0) return ''
    const headerCells = cellsOf(rows[0])
    const delimiter = Array.from({ length: width }, (_, i) => {
      const cell = headerCells[i]
      const align = cell && (cell.getAttribute('align') ?? styleOf(cell, 'text-align'))
      return align === 'center'
        ? ':-:'
        : align === 'right'
          ? '--:'
          : align === 'left'
            ? ':--'
            : '---'
    })
    const line = (cells: string[]) =>
      `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`
    return `\n\n${[line(grid[0]), line(delimiter), ...grid.slice(1).map(line)].join('\n')}\n\n`
  },
})

/** HTML을 마크다운으로 */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html)
}

/**
 * 마크다운으로 바꿀 만한 서식이 있는 HTML인지.
 * 편집기·터미널·IDE에서 복사하면 <div>·<span>·<pre>만 오는데, 이건 글자 그대로 넣는 편이 낫다.
 */
export function hasFormatting(html: string): boolean {
  return (
    /<(h[1-6]|strong|em|a|ul|ol|table|blockquote|img|del|s|hr)[\s>]/i.test(html) ||
    /<(b|i)[\s>]/i.test(html.replace(/<b[^>]*font-weight:\s*normal[^>]*>/gi, '')) ||
    /font-weight:\s*(bold|[6-9]00)|font-style:\s*italic/i.test(html)
  )
}

/** 주소 하나뿐인 글 */
const SINGLE_URL = /^https?:\/\/\S+$/

/**
 * from~to가 코드(코드 블록·인라인 코드)에 걸치는지. 커서만 있으면 코드 안쪽일 때만
 * (`` `코드`| ``처럼 닫는 ` 바로 뒤는 밖이다). 고른 범위면 일부만 걸쳐도 코드로 본다.
 */
function touchesCode(state: EditorState, from: number, to: number): boolean {
  let found = false
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (found) return false
      if (!/^(FencedCode|CodeBlock|InlineCode)$/.test(node.name)) return
      found = from === to ? node.from < from && from < node.to : node.from < to && node.to > from
      return false
    },
  })
  return found
}

/** 붙여넣을 마크다운. 기본 붙여넣기(글자 그대로)에 맡길 때는 null */
export function pasteText(state: EditorState, text: string, html: string): string | null {
  const ranges = state.selection.ranges
  const sel = state.selection.main
  if (ranges.length > 1 || touchesCode(state, sel.from, sel.to)) return null
  const url = text.trim()
  if (!sel.empty && SINGLE_URL.test(url)) {
    const label = state.sliceDoc(sel.from, sel.to)
    if (!label.includes('\n') && !SINGLE_URL.test(label.trim())) return `[${label}](${url})`
  }
  if (!html || !hasFormatting(html)) return null
  const md = htmlToMarkdown(html)
  return md.trim() ? md : null
}

export const pasteMarkdown = EditorView.domEventHandlers({
  paste(event, view) {
    const data = event.clipboardData
    if (!data || view.state.readOnly) return false
    // VS Code는 서식 HTML을 함께 싣지만 코드라서 글자 그대로가 맞다
    if (data.types.includes('vscode-editor-data')) return false
    const insert = pasteText(view.state, data.getData('text/plain'), data.getData('text/html'))
    if (insert === null) return false
    event.preventDefault()
    view.dispatch(view.state.replaceSelection(insert), {
      userEvent: 'input.paste',
      scrollIntoView: true,
    })
    return true
  },
})
