import { describe, expect, it } from 'vitest'
import type { Recommendation } from '../api'
import {
  INSERTED_KNOWLEDGE_FIRST_LINE,
  insertedKnowledgeMarkdown,
  insertionAt,
} from './insertedKnowledge'

const evidence = (quote: string, noteTitle: string) => ({
  noteId: 'n',
  noteTitle,
  noteVersion: 1,
  startOffset: 0,
  endOffset: quote.length,
  quote,
})

const card: Pick<Recommendation, 'conclusion' | 'evidenceA' | 'evidenceB' | 'externalKnowledge'> = {
  conclusion: '쓰기 요청을 멱등하게 설계해야 한다.',
  evidenceA: evidence('클라이언트는 응답 시간이 초과되면 요청을 재전송한다.', '재시도 정책'),
  evidenceB: evidence('멱등한 연산은 여러 번 실행해도 결과가 같다.', '멱등성'),
  externalKnowledge: {
    summary: 'PUT·DELETE는 멱등 메서드다.',
    sourceUrl: 'https://www.rfc-editor.org/rfc/rfc9110',
  },
}

describe('넣을 마크다운 (W3-22c)', () => {
  it('라벨 · 결론 · A · B · 외부 지식 · URL 순서의 인용 블록이고, 줄 사이에 빈 인용 줄(>)을 둔다', () => {
    expect(insertedKnowledgeMarkdown(card)).toBe(
      [
        '> **새로 이해한 지식**',
        '>',
        '> **쓰기 요청을 멱등하게 설계해야 한다.**',
        '>',
        '> A · 클라이언트는 응답 시간이 초과되면 요청을 재전송한다. (재시도 정책)',
        '>',
        '> B · 멱등한 연산은 여러 번 실행해도 결과가 같다. (멱등성)',
        '>',
        '> 외부 · PUT·DELETE는 멱등 메서드다.',
        '>',
        '> <https://www.rfc-editor.org/rfc/rfc9110>',
      ].join('\n'),
    )
  })

  it('글의 마크다운 특수문자는 이스케이프해 굵게가 일찍 닫히지 않는다', () => {
    const md = insertedKnowledgeMarkdown({
      ...card,
      conclusion: '**멱등** 키와 _재시도_ [링크](x) $x$',
      evidenceA: evidence('`code` <b> #태그 a|b ~취소~', '제목*'),
      externalKnowledge: { summary: '1 \\ 2', sourceUrl: 'https://example.com/a_b' },
    })
    expect(md).toContain('> **\\*\\*멱등\\*\\* 키와 \\_재시도\\_ \\[링크\\](x) \\$x\\$**')
    expect(md).toContain('> A · \\`code\\` \\<b\\> \\#태그 a\\|b \\~취소\\~ (제목\\*)')
    expect(md).toContain('> 외부 · 1 \\\\ 2')
    // URL은 주소 그대로 (autolink 안은 이스케이프하지 않는다)
    expect(md).toContain('> <https://example.com/a_b>')
  })

  it('첫 줄은 Live Preview가 알아보는 라벨이다', () => {
    const first = insertedKnowledgeMarkdown(card).split('\n')[0]
    expect(INSERTED_KNOWLEDGE_FIRST_LINE.test(first)).toBe(true)
    expect(INSERTED_KNOWLEDGE_FIRST_LINE.test('> **다른 굵은 글**')).toBe(false)
  })

  it('외부 지식이 없으면(null) 외부 지식과 URL 줄을 뺀다', () => {
    const md = insertedKnowledgeMarkdown({ ...card, externalKnowledge: null })
    expect(md.split('\n').filter((l) => l !== '>')).toHaveLength(4)
    expect(md).not.toContain('외부')
  })

  it('여러 줄 문장은 한 줄로 합쳐 블록이 끊기지 않게 한다', () => {
    const md = insertedKnowledgeMarkdown({
      ...card,
      evidenceA: evidence('첫 줄\n  둘째 줄', '노트'),
    })
    expect(md).toContain('> A · 첫 줄 둘째 줄 (노트)')
    expect(md.split('\n').every((l) => l === '>' || l.startsWith('> '))).toBe(true)
  })

  it('http·https가 아닌 주소는 넣지 않는다', () => {
    const md = insertedKnowledgeMarkdown({
      ...card,
      externalKnowledge: { summary: '요약', sourceUrl: 'javascript:alert(1)' },
    })
    expect(md).toContain('> 외부 · 요약')
    expect(md).not.toContain('javascript')
  })
})

describe('블록 사이에 넣기', () => {
  const block = '> 넣은 것'

  it('두 블록 사이(빈 줄 있음)에 넣으면 앞뒤로 빈 줄 하나씩 둔다', () => {
    const doc = '첫 문단\n\n둘째 문단'
    const { from, insert } = insertionAt(doc, doc.indexOf('둘째'), block)
    const out = doc.slice(0, from) + insert + doc.slice(from)
    expect(out).toBe('첫 문단\n\n> 넣은 것\n\n둘째 문단')
  })

  it('빈 줄 없이 붙은 블록(제목 바로 아래) 사이에도 빈 줄을 만든다', () => {
    const doc = '## 제목\n본문'
    const { from, insert } = insertionAt(doc, doc.indexOf('본문'), block)
    expect(doc.slice(0, from) + insert + doc.slice(from)).toBe('## 제목\n\n> 넣은 것\n\n본문')
  })

  it('문서 처음과 끝', () => {
    const doc = '본문'
    const start = insertionAt(doc, 0, block)
    expect(start.insert + doc).toBe('> 넣은 것\n\n본문')
    const end = insertionAt(doc, doc.length, block)
    expect(doc + end.insert).toBe('본문\n\n> 넣은 것')
    const endWithNewline = insertionAt('본문\n', 3, block)
    expect('본문\n' + endWithNewline.insert).toBe('본문\n\n> 넣은 것')
  })

  it('빈 문서', () => {
    expect(insertionAt('', 0, block)).toEqual({ from: 0, insert: block })
  })
})
