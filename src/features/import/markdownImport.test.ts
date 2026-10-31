import { describe, expect, it } from 'vitest'
import {
  blockingReason,
  decodeMarkdown,
  isMarkdownFileName,
  NOTE_BODY_MAX,
  previewLines,
  sendable,
  titleFromFileName,
  type ImportItem,
} from './markdownImport'

const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

function item(overrides: Partial<ImportItem>): ImportItem {
  return {
    key: overrides.key ?? Math.random().toString(36),
    fileName: 'a.md',
    title: 'a',
    topicId: null,
    body: '# a',
    readError: null,
    status: 'ready',
    error: null,
    noteId: null,
    ...overrides,
  }
}

describe('isMarkdownFileName', () => {
  it('.md·.markdown만 받는다 (대소문자 무시)', () => {
    expect(isMarkdownFileName('노트.md')).toBe(true)
    expect(isMarkdownFileName('README.MD')).toBe(true)
    expect(isMarkdownFileName('a.markdown')).toBe(true)
    expect(isMarkdownFileName('a.txt')).toBe(false)
    expect(isMarkdownFileName('md')).toBe(false)
  })
})

describe('titleFromFileName', () => {
  it('확장자를 떼고 앞뒤 공백을 지운다', () => {
    expect(titleFromFileName('  재시도 정책 .md')).toBe('재시도 정책')
    expect(titleFromFileName('a.b.markdown')).toBe('a.b')
  })

  it("제목에 쓸 수 없는 '/'는 '-'로 바꾼다", () => {
    expect(titleFromFileName('TCP/IP.md')).toBe('TCP-IP')
  })

  it('NFC로 정규화한다 (macOS 파일 이름은 NFD)', () => {
    const nfd = '한글.md'.normalize('NFD')
    expect(titleFromFileName(nfd)).toBe('한글')
    expect(titleFromFileName(nfd)).toBe('한글'.normalize('NFC'))
  })

  it('200자에서 자르고, 비면 "제목 없음"', () => {
    expect([...titleFromFileName(`${'가'.repeat(250)}.md`)]).toHaveLength(200)
    expect(titleFromFileName('.md')).toBe('제목 없음')
  })
})

describe('decodeMarkdown', () => {
  it('UTF-8을 읽고 BOM을 뗀다', () => {
    expect(decodeMarkdown(encode('﻿# 제목'))).toEqual({ ok: true, text: '# 제목' })
  })

  it('UTF-8이 아니면 이유를 준다', () => {
    const latin1 = new Uint8Array([0xff, 0xfe, 0x41]).buffer
    expect(decodeMarkdown(latin1)).toMatchObject({ ok: false })
  })

  it('100만 자를 넘으면 거절한다 (코드 포인트 기준)', () => {
    expect(decodeMarkdown(encode('a'.repeat(NOTE_BODY_MAX))).ok).toBe(true)
    expect(decodeMarkdown(encode('a'.repeat(NOTE_BODY_MAX + 1))).ok).toBe(false)
    // 이모지 하나는 UTF-16 두 단위지만 한 글자로 센다
    expect(decodeMarkdown(encode('😀'.repeat(NOTE_BODY_MAX))).ok).toBe(true)
  })
})

describe('blockingReason', () => {
  it('읽지 못한 파일은 그 이유', () => {
    const a = item({ readError: '읽지 못함', body: null })
    expect(blockingReason(a, [a])).toBe('읽지 못함')
  })

  it('제목 규칙을 검사한다', () => {
    const empty = item({ title: '  ' })
    const slash = item({ title: 'a/b' })
    expect(blockingReason(empty, [empty])).toBe('제목을 입력하세요.')
    expect(blockingReason(slash, [slash])).toBe("제목에는 '/'를 쓸 수 없습니다.")
  })

  it('같은 주제에 같은 제목인 파일끼리 막는다. 주제가 다르면 괜찮다', () => {
    const a = item({ key: 'a', title: '인덱스', topicId: 't1' })
    const b = item({ key: 'b', title: ' 인덱스 ', topicId: 't1' })
    const c = item({ key: 'c', title: '인덱스', topicId: null })
    const all = [a, b, c]
    expect(blockingReason(a, all)).toMatch(/같은 제목/)
    expect(blockingReason(b, all)).toMatch(/같은 제목/)
    expect(blockingReason(c, all)).toBeNull()
  })

  it('이미 가져온 파일은 검사하지 않고, 그 제목과 겹치는 새 파일은 따로 알린다', () => {
    const done = item({ key: 'a', title: '인덱스', status: 'done' })
    const other = item({ key: 'b', title: '인덱스' })
    expect(blockingReason(done, [done, other])).toBeNull()
    expect(blockingReason(other, [done, other])).toBe(
      '방금 가져온 노트와 같은 주제에 같은 제목입니다.',
    )
  })
})

describe('sendable', () => {
  it('대기·실패이고 막을 이유가 없는 파일만', () => {
    const ready = item({ key: '1', title: '하나' })
    const failed = item({ key: '2', title: '둘', status: 'failed', error: '중복' })
    const done = item({ key: '3', title: '셋', status: 'done' })
    const bad = item({ key: '4', title: 'a/b' })
    expect(sendable([ready, failed, done, bad]).map((i) => i.key)).toEqual(['1', '2'])
  })
})

describe('previewLines', () => {
  it('앞 줄만 자르고 더 있는지 알려준다', () => {
    expect(previewLines('a\nb\nc', 2)).toEqual({ text: 'a\nb', more: true })
    expect(previewLines('a\r\nb', 5)).toEqual({ text: 'a\nb', more: false })
  })
})
