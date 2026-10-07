import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { buildDecorations } from './livePreview'

/** 문서와 커서 위치(줄 번호, 1부터)로 장식을 만들고 알아보기 쉬운 모양으로 돌려준다 */
function decorate(doc: string, cursorLine: number, focused = true) {
  const base = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
  const state = base.update({
    selection: EditorSelection.cursor(base.doc.line(cursorLine).from),
  }).state
  const hidden: string[] = []
  const bullets: number[] = []
  const lines: Record<number, string> = {}
  const marks: [string, string][] = []
  buildDecorations(state, { focused }).between(0, doc.length, (from, to, deco) => {
    const spec = deco.spec as { class?: string; widget?: unknown }
    if (spec.widget) bullets.push(from)
    else if (spec.class === 'cm-lp-blank') return
    else if (spec.class && from === to) lines[state.doc.lineAt(from).number] = spec.class
    else if (spec.class) marks.push([spec.class, doc.slice(from, to)])
    else hidden.push(doc.slice(from, to))
  })
  return { hidden, bullets, lines, marks }
}

describe('제목', () => {
  it('커서가 다른 줄이면 ## 를 숨기고 제목 크기를 입힌다', () => {
    const d = decorate('## 재시도 조건\n본문', 2)
    expect(d.hidden).toEqual(['## '])
    expect(d.lines[1]).toBe('cm-lp-h2')
  })

  it('커서가 있는 줄은 ## 를 드러낸다 (크기는 그대로)', () => {
    const d = decorate('## 재시도 조건\n본문', 1)
    expect(d.hidden).toEqual([])
    expect(d.lines[1]).toBe('cm-lp-h2')
  })
})

describe('인라인 서식', () => {
  it('굵게·기울임·인라인 코드: 기호를 숨기고 서식을 입힌다', () => {
    const d = decorate('**재전송**과 *강조*와 `Idempotency-Key`\n다음 줄', 2)
    expect(d.hidden).toEqual(['**', '**', '*', '*', '`', '`'])
    expect(d.marks).toEqual([
      ['cm-lp-strong', '**재전송**'],
      ['cm-lp-em', '*강조*'],
      ['cm-lp-code', '`Idempotency-Key`'],
    ])
  })

  it('링크: 글자만 남기고 대괄호·주소를 숨긴다', () => {
    const d = decorate('[HTTP 멱등 메서드](https://example.com) 문서\n다음 줄', 2)
    expect(d.hidden).toEqual(['[', ']', '(', 'https://example.com', ')'])
    expect(d.marks).toEqual([['cm-lp-link', '[HTTP 멱등 메서드](https://example.com)']])
  })

  it('커서가 있는 줄은 기호를 모두 드러낸다', () => {
    expect(decorate('**재전송**\n다음 줄', 1).hidden).toEqual([])
  })
})

describe('목록·인용', () => {
  it('글머리표는 •로 바꾸고, 번호 목록은 그대로 둔다', () => {
    const d = decorate('- 첫째\n- 둘째\n\n1. 번호\n\n끝', 6)
    expect(d.bullets).toEqual([0, 5])
    expect(d.hidden).toEqual([])
  })

  it('커서가 있는 글머리표 줄은 - 를 드러낸다', () => {
    expect(decorate('- 첫째\n- 둘째', 1).bullets).toEqual([5])
  })

  it('인용: > 를 숨기고 줄마다 인용 모양을 입힌다', () => {
    const d = decorate('> 멱등하지 않은 쓰기\n\n끝', 3)
    expect(d.hidden).toEqual(['> '])
    expect(d.lines[1]).toBe('cm-lp-quote')
  })
})

describe('코드 블록', () => {
  const doc = '```yaml\nretry:\n  maxAttempts: 3\n```\n끝'

  it('커서가 블록 밖이면 ``` 줄을 숨기고 여백으로만 남긴다', () => {
    const d = decorate(doc, 5)
    expect(d.hidden).toEqual(['```yaml', '```'])
    expect(d.lines[1]).toBe('cm-lp-codeblock cm-lp-code-top cm-lp-fence-hidden')
    expect(d.lines[2]).toBe('cm-lp-codeblock')
    expect(d.lines[4]).toBe('cm-lp-codeblock cm-lp-code-bottom cm-lp-fence-hidden')
  })

  it('커서가 블록 안이면 ``` 줄을 드러낸다', () => {
    const d = decorate(doc, 2)
    expect(d.hidden).toEqual([])
    expect(d.lines[1]).toBe('cm-lp-codeblock cm-lp-code-top')
  })

  it('코드 블록 안의 ** 나 # 은 서식으로 보지 않는다', () => {
    const d = decorate('```\n# 주석 **굵게 아님**\n```\n끝', 4)
    expect(d.marks).toEqual([])
    expect(d.lines[2]).toBe('cm-lp-codeblock')
  })
})

describe('포커스·빈 줄', () => {
  it('편집기에 포커스가 없으면 커서 줄도 기호를 숨긴다', () => {
    expect(decorate('# 개요\n본문', 1, false).hidden).toEqual(['# '])
  })

  it('블록 사이 빈 줄은 줄이고, 커서가 있는 빈 줄과 코드 블록 안 빈 줄은 그대로 둔다', () => {
    const doc = '문단\n\n```\na\n\nb\n```\n\n끝'
    const base = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
    const state = base.update({ selection: EditorSelection.cursor(base.doc.line(8).from) }).state
    const blank: number[] = []
    buildDecorations(state).between(0, doc.length, (from, _to, deco) => {
      if ((deco.spec as { class?: string }).class === 'cm-lp-blank') {
        blank.push(state.doc.lineAt(from).number)
      }
    })
    expect(blank).toEqual([2])
  })
})
