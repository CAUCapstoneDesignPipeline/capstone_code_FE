import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  atomicRanges,
  buildDecorations,
  deleteEmptyHeadingLine,
  linkAt,
  safeUrl,
} from './livePreview'

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

  it('커서가 있는 줄이어도 ## 는 숨긴다 (줄이 흔들리지 않게)', () => {
    const d = decorate('## 재시도 조건\n본문', 1)
    expect(d.hidden).toEqual(['## '])
    expect(d.lines[1]).toBe('cm-lp-h2')
  })

  it('## 입력 중에는 기호를 드러내고, 공백을 치면 바로 숨긴다', () => {
    const typing = decorate('본문\n##', 2)
    expect(typing.hidden).toEqual([])
    expect(typing.lines[2]).toBe('cm-lp-h2')
    expect(decorate('본문\n## ', 2).hidden).toEqual(['## '])
  })

  it('닫는 ## 는 앞 공백까지 숨긴다', () => {
    expect(decorate('## 제목 ##\n본문', 2).hidden).toEqual(['## ', ' ##'])
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

  it('커서가 닿은 서식만 기호를 드러낸다', () => {
    expect(decorate('**재전송**\n다음 줄', 1).hidden).toEqual([])
    // 커서가 줄 맨 앞(**재전송** 앞)에 있으면 `코드`의 기호는 그대로 숨긴다
    expect(decorate('**재전송** 뒤 `코드`', 1).hidden).toEqual(['`', '`'])
  })
})

describe('목록·인용', () => {
  it('글머리표는 •로 바꾸고, 번호 목록은 그대로 둔다', () => {
    const d = decorate('- 첫째\n- 둘째\n\n1. 번호\n\n끝', 6)
    expect(d.bullets).toEqual([0, 5])
    expect(d.hidden).toEqual([])
  })

  it('커서가 있는 글머리표 줄도 •로 보이고, - 뒤에 공백을 치기 전에만 - 를 드러낸다', () => {
    expect(decorate('- 첫째\n- 둘째', 1).bullets).toEqual([0, 5])
    expect(decorate('- 첫째\n- ', 2).bullets).toEqual([0, 5])
    expect(decorate('- 첫째\n-', 2).bullets).toEqual([0])
  })

  it('할 일: - [ ] 를 체크박스로 바꾸고, 끝낸 일은 줄에 표시한다', () => {
    const d = decorate('- [ ] 할 일\n- [x] 끝낸 일\n\n끝', 4)
    expect(d.hidden).toEqual(['- ', '- '])
    expect(d.bullets).toEqual([2, 12])
    expect(d.lines[2]).toBe('cm-lp-task-done')
  })

  it('구분선: 커서가 없으면 --- 를 숨기고 선으로 그린다', () => {
    const d = decorate('위\n\n---\n\n아래', 5)
    expect(d.hidden).toEqual(['---'])
    expect(d.lines[3]).toBe('cm-lp-hr')
    expect(decorate('위\n\n---\n\n아래', 3).hidden).toEqual([])
  })

  it('인용: > 를 숨기고 줄마다 인용 모양을 입힌다', () => {
    const d = decorate('> 멱등하지 않은 쓰기\n\n끝', 3)
    expect(d.hidden).toEqual(['> '])
    expect(d.lines[1]).toBe('cm-lp-quote')
    expect(decorate('> 멱등하지 않은 쓰기', 1).hidden).toEqual(['> '])
  })
})

describe('atomicRanges', () => {
  it('숨기거나 바꿔 그린 범위만 고른다 (서식·줄 장식은 빼고)', () => {
    const doc = '## 제목\n- **굵게**\n끝'
    const base = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
    const state = base.update({ selection: EditorSelection.cursor(base.doc.length) }).state
    const ranges: string[] = []
    atomicRanges(buildDecorations(state)).between(0, doc.length, (from, to) => {
      ranges.push(doc.slice(from, to))
    })
    expect(ranges).toEqual(['## ', '-', '**', '**'])
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

describe('빈 제목 줄', () => {
  it('## 뒤에 공백을 치면 Header {단계} 안내 글을 보인다', () => {
    const state = EditorState.create({
      doc: '본문\n## ',
      extensions: [markdown({ base: markdownLanguage })],
    })
    const widgets: [number, string][] = []
    buildDecorations(state).between(0, state.doc.length, (from, _to, deco) => {
      const widget = deco.spec.widget as { level?: number } | undefined
      if (widget?.level) widgets.push([from, `Header ${widget.level}`])
    })
    expect(widgets).toEqual([[6, 'Header 2']])
  })

  it('글이 있거나 공백 전(## 입력 중)이면 안내 글이 없다', () => {
    for (const doc of ['## 제목', '##']) {
      const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
      let count = 0
      buildDecorations(state).between(0, doc.length, (_from, _to, deco) => {
        if ((deco.spec.widget as { level?: number } | undefined)?.level) count++
      })
      expect(count).toBe(0)
    }
  })

  /** 커서를 cursor에 두고 deleteEmptyHeadingLine을 실행한다 */
  function backspace(doc: string, cursor: number) {
    let state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [markdown({ base: markdownLanguage })],
    })
    const handled = deleteEmptyHeadingLine({ state, dispatch: (tr) => (state = tr.state) })
    return { handled, doc: state.doc.toString(), cursor: state.selection.main.head }
  }

  it('빈 제목 줄에서 Backspace를 누르면 줄을 지우고 커서는 앞 줄 끝으로 간다', () => {
    expect(backspace('본문\n## ', 6)).toEqual({ handled: true, doc: '본문', cursor: 2 })
  })

  it('첫 줄이면 줄과 줄바꿈을 지운다', () => {
    expect(backspace('# \n본문', 2)).toEqual({ handled: true, doc: '본문', cursor: 0 })
  })

  it('글이 있는 제목이나 다른 줄은 기본 동작에 맡긴다', () => {
    expect(backspace('# 가', 3).handled).toBe(false)
    expect(backspace('##', 2).handled).toBe(false)
    expect(backspace('- ', 2).handled).toBe(false)
  })

  it('코드 블록 안의 # 줄은 제목이 아니므로 지우지 않는다', () => {
    expect(backspace('```\n# \n```', 6).handled).toBe(false)
  })
})

describe('Setext 제목', () => {
  it('글 줄에 제목 크기를 입히고, 커서가 없으면 밑줄 줄을 접는다', () => {
    const d = decorate('큰 제목\n===\n\n작은 제목\n---\n\n끝', 7)
    expect(d.lines[1]).toBe('cm-lp-h1')
    expect(d.lines[2]).toBe('cm-lp-setext-hidden')
    expect(d.lines[4]).toBe('cm-lp-h2')
    expect(d.lines[5]).toBe('cm-lp-setext-hidden')
    expect(d.hidden).toEqual(['===', '---'])
  })

  it('커서가 밑줄 줄에 있으면 흐리게 드러낸다', () => {
    const d = decorate('큰 제목\n===', 2)
    expect(d.lines[2]).toBe('cm-lp-setext-mark')
    expect(d.hidden).toEqual([])
  })

  it('여러 줄 글이면 줄마다 제목 크기를 입힌다', () => {
    const d = decorate('첫 줄\n둘째 줄\n===\n\n끝', 5)
    expect(d.lines[1]).toBe('cm-lp-h1')
    expect(d.lines[2]).toBe('cm-lp-h1')
  })
})

/** 이미지 위젯을 [위치, 바꿔 그린 원문(끼워 넣은 위젯이면 ''), src] 로 */
function images(doc: string, cursor: number) {
  const base = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
  const state = base.update({ selection: EditorSelection.cursor(cursor) }).state
  const out: [number, string, string][] = []
  buildDecorations(state).between(0, doc.length, (from, to, deco) => {
    const widget = deco.spec.widget as { src?: string } | undefined
    if (widget?.src) out.push([from, doc.slice(from, to), widget.src])
  })
  return out
}

describe('이미지', () => {
  const doc = '![고양이](https://example.com/cat.png)\n끝'
  const src = 'https://example.com/cat.png'

  it('커서가 없으면 원문을 그림으로 바꾼다', () => {
    expect(images(doc, doc.length)).toEqual([[0, doc.split('\n')[0], src]])
  })

  it('커서가 닿으면 원문을 두고 그림을 바로 뒤에 끼운다', () => {
    const imageEnd = doc.indexOf('\n')
    expect(images(doc, 3)).toEqual([[imageEnd, '', src]])
    expect(decorate(doc, 1).marks).toContainEqual(['cm-lp-image-src', doc.slice(0, imageEnd)])
  })

  it('http(s)가 아닌 주소는 그림으로 그리지 않는다', () => {
    expect(images('![x](javascript:alert(1))\n끝', 20)).toEqual([])
    expect(images('![x](./local.png)\n끝', 18)).toEqual([])
  })
})

describe('링크', () => {
  it('<주소>와 맨 주소도 링크 모양을 입히고, <> 는 숨긴다', () => {
    const d = decorate('<https://a.com> 과 https://b.com\n끝', 2)
    // 겹치는 장식은 층이 나뉘어 순서가 위치순이 아니다
    expect(d.marks).toHaveLength(2)
    expect(d.marks).toEqual(
      expect.arrayContaining([
        ['cm-lp-link', '<https://a.com>'],
        ['cm-lp-link', 'https://b.com'],
      ]),
    )
    expect(d.hidden).toEqual(['<', '>'])
  })

  it('참조 링크는 [1] 이름까지 숨긴다', () => {
    const d = decorate('[글][1]\n\n[1]: https://c.com', 3)
    expect(d.hidden).toEqual(['[', ']', '[1]'])
  })
})

describe('linkAt', () => {
  const at = (doc: string, pos: number) =>
    linkAt(EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] }), pos)

  it('링크 글 위면 그 주소', () => {
    expect(at('보기: [문서](https://example.com/a) 끝', 6)).toBe('https://example.com/a')
  })

  it('<주소>와 맨 주소', () => {
    expect(at('<https://a.com>', 5)).toBe('https://a.com/')
    expect(at('여기 https://b.com/x 참고', 8)).toBe('https://b.com/x')
  })

  it('참조 링크는 정의에서 주소를 찾는다 (이름 대소문자 무시)', () => {
    const doc = '[글][Ref] 와 [Ref]\n\n[ref]: https://c.com'
    expect(at(doc, 1)).toBe('https://c.com/')
    expect(at(doc, doc.indexOf('[Ref]', 6) + 2)).toBe('https://c.com/')
  })

  it('링크가 아니거나 열면 안 되는 주소는 null', () => {
    expect(at('그냥 글', 1)).toBeNull()
    expect(at('[나쁜](javascript:alert(1))', 2)).toBeNull()
  })
})

describe('safeUrl', () => {
  const allow = ['http:', 'https:', 'mailto:']
  it('<주소>·www.·이메일도 열 수 있는 주소로', () => {
    expect(safeUrl('<https://x.com/a b>', allow)).toBe('https://x.com/a%20b')
    expect(safeUrl('www.example.com', allow)).toBe('https://www.example.com/')
    expect(safeUrl('foo@bar.com', allow)).toBe('mailto:foo@bar.com')
  })
  it('허용하지 않은 프로토콜·상대 주소는 null', () => {
    expect(safeUrl('javascript:alert(1)', allow)).toBeNull()
    expect(safeUrl('./a.png', allow)).toBeNull()
  })
})

describe('리뷰 반영', () => {
  const at = (doc: string, pos: number) =>
    linkAt(EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] }), pos)

  it('<이메일>과 www. 맨 주소도 ⌘+클릭으로 연다', () => {
    expect(at('<foo@bar.com>', 3)).toBe('mailto:foo@bar.com')
    expect(at('여기 www.example.com 참고', 6)).toBe('https://www.example.com/')
  })

  it('목록 안의 참조 정의도 찾는다', () => {
    const doc = '[글][1]\n\n- 항목\n\n  [1]: https://c.com'
    expect(at(doc, 1)).toBe('https://c.com/')
  })

  it('이스케이프 \\ 는 커서가 닿지 않으면 숨긴다', () => {
    expect(decorate('\\*별표 아님\n끝', 2).hidden).toEqual(['\\'])
    expect(decorate('\\*별표 아님\n끝', 1).hidden).toEqual([])
  })

  it('표 안의 서식 기호는 숨기지 않는다 (원문 칸 맞춤)', () => {
    const d = decorate('| **a** | [x](https://y.com) |\n|---|---|\n\n끝', 4)
    expect(d.hidden).toEqual([])
    expect(d.marks).toEqual([])
  })
})
