import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { hasFormatting, htmlToMarkdown, pasteText } from './pasteMarkdown'

describe('htmlToMarkdown', () => {
  it('제목·굵게·기울임·취소선·링크', () => {
    expect(
      htmlToMarkdown(
        '<h2>개요</h2><p><strong>굵게</strong> <em>기울임</em> <del>취소</del> <a href="https://a.com">링크</a></p>',
      ),
    ).toBe('## 개요\n\n**굵게** *기울임* ~~취소~~ [링크](https://a.com)')
  })

  it('목록은 `- 항목`으로, 하위 목록은 기호 너비만큼 들여쓴다', () => {
    expect(htmlToMarkdown('<ul><li>하나<ul><li>안쪽</li></ul></li><li>둘</li></ul>')).toBe(
      '- 하나\n  - 안쪽\n- 둘',
    )
    expect(htmlToMarkdown('<ol start="3"><li>셋</li><li>넷</li></ol>')).toBe('3. 셋\n4. 넷')
  })

  it('체크박스는 할 일로', () => {
    expect(
      htmlToMarkdown(
        '<ul><li><input type="checkbox" checked> 끝냄</li><li><input type="checkbox"> 남음</li></ul>',
      ),
    ).toBe('- [x] 끝냄\n- [ ] 남음')
  })

  it('<pre>는 언어를 살린 코드 블록으로', () => {
    expect(htmlToMarkdown('<pre><code class="language-yaml">retry:\n  max: 3\n</code></pre>')).toBe(
      '```yaml\nretry:\n  max: 3\n```',
    )
  })

  it('표는 첫 줄을 머리글로 한 GFM 표로 (정렬, | 이스케이프)', () => {
    expect(
      htmlToMarkdown(
        '<table><tr><th>이름</th><th align="right">값</th></tr><tr><td><b>a|b</b></td><td>1</td></tr><tr><td>c</td></tr></table>',
      ),
    ).toBe('| 이름 | 값 |\n| --- | --: |\n| **a\\|b** | 1 |\n| c |  |')
  })

  it('Google Docs: 감싼 <b font-weight:normal>은 무시하고 style 굵게·기울임은 살린다', () => {
    expect(
      htmlToMarkdown(
        '<b style="font-weight:normal;" id="docs-internal-guid-1"><p><span style="font-weight:700;">굵게</span> <span style="font-style:italic;">기울임</span> 보통</p></b>',
      ),
    ).toBe('**굵게** *기울임* 보통')
  })

  it('이미지: http(s)만 남기고 data: 그림은 alt 글만', () => {
    expect(htmlToMarkdown('<img src="https://a.com/x (1).png" alt="그림">')).toBe(
      '![그림](https://a.com/x%20%281%29.png)',
    )
    expect(htmlToMarkdown('<p><img src="data:image/png;base64,AAAA" alt="붙인 그림"></p>')).toBe(
      '붙인 그림',
    )
  })
})

describe('hasFormatting', () => {
  it('서식 태그나 굵게·기울임 style이 있으면 true', () => {
    expect(hasFormatting('<p>그냥 <strong>굵게</strong></p>')).toBe(true)
    expect(hasFormatting('<span style="font-weight:700">굵게</span>')).toBe(true)
    expect(hasFormatting('<a href="x">링크</a>')).toBe(true)
  })

  it('편집기·터미널에서 복사한 <div>·<span>·<pre>나 Google Docs 감싸개뿐이면 false', () => {
    expect(hasFormatting('<div><span style="color:red">const a = 1</span></div>')).toBe(false)
    expect(hasFormatting('<pre>ls -al</pre>')).toBe(false)
    expect(hasFormatting('<b style="font-weight:normal;"><span>보통 글</span></b>')).toBe(false)
  })
})

describe('pasteText', () => {
  function state(doc: string, from: number, to = from) {
    const base = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
    return base.update({ selection: EditorSelection.single(from, to) }).state
  }

  it('글을 고른 채 주소를 붙이면 링크로 만든다', () => {
    expect(pasteText(state('API 문서 참고', 0, 6), 'https://a.com/docs', '')).toBe(
      '[API 문서](https://a.com/docs)',
    )
  })

  it('고른 글이 없거나 여러 줄이면 주소를 그대로 둔다', () => {
    expect(pasteText(state('글', 1), 'https://a.com', '')).toBeNull()
    expect(pasteText(state('가\n나', 0, 3), 'https://a.com', '')).toBeNull()
  })

  it('서식 있는 HTML은 마크다운으로 바꾼다', () => {
    expect(pasteText(state('', 0), '굵게', '<strong>굵게</strong>')).toBe('**굵게**')
  })

  it('서식 없는 HTML이나 코드 블록 안이면 기본 붙여넣기에 맡긴다', () => {
    expect(pasteText(state('', 0), '글', '<span>글</span>')).toBeNull()
    expect(pasteText(state('```\n\n```', 4), '굵게', '<strong>굵게</strong>')).toBeNull()
    expect(pasteText(state('`코드`', 2, 4), 'https://a.com', '')).toBeNull()
  })
})

describe('리뷰 반영', () => {
  it('보통 글의 _ [ ] 는 \\ 없이 그대로 둔다', () => {
    expect(htmlToMarkdown('<p>call <b>snake_case()</b> with [opts]</p>')).toBe(
      'call **snake_case()** with [opts]',
    )
  })

  it('서식이 될 * ` 와 줄 앞 블록 기호는 막는다', () => {
    expect(htmlToMarkdown('<p><b>a*b</b> `x`</p><p>1. 번호 아님</p><p># 제목 아님</p>')).toBe(
      '**a\\*b** \\`x\\`\n\n1\\. 번호 아님\n\n\\# 제목 아님',
    )
  })

  it('칸 안에 겹친 표는 바깥 표의 줄로 섞지 않고 글자만 남긴다', () => {
    expect(
      htmlToMarkdown(
        '<table><tr><th>머리</th></tr><tr><td>앞 <table><tr><td>안1</td><td>안2</td></tr></table> 뒤</td></tr></table>',
      ),
    ).toBe('| 머리 |\n| --- |\n| 앞 안1안2 뒤 |')
  })

  function state(doc: string, from: number, to = from) {
    const base = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
    return base.update({ selection: EditorSelection.single(from, to) }).state
  }

  it('닫는 ` 바로 뒤는 코드 밖이라 서식을 바꿔 넣는다', () => {
    expect(pasteText(state('`코드` ', 4), '굵게', '<strong>굵게</strong>')).toBe('**굵게**')
  })

  it('문단에서 코드 블록까지 고른 채 붙이면 글자 그대로 둔다', () => {
    const doc = '문단\n\n```\n코드\n```'
    expect(pasteText(state(doc, 0, 9), '굵게', '<strong>굵게</strong>')).toBeNull()
  })
})
