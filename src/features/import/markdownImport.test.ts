import { describe, expect, it } from 'vitest'
import {
  decodeText,
  formatSize,
  isImportableFileName,
  NOTE_BODY_MAX,
  numberedTitle,
  titleFromFileName,
} from './markdownImport'

const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

describe('isImportableFileName', () => {
  it('.md·.markdown·.txt만 받는다 (대소문자 무시)', () => {
    expect(isImportableFileName('노트.md')).toBe(true)
    expect(isImportableFileName('README.MD')).toBe(true)
    expect(isImportableFileName('a.markdown')).toBe(true)
    expect(isImportableFileName('메모.txt')).toBe(true)
    expect(isImportableFileName('캐시 일관성.pdf')).toBe(false)
    expect(isImportableFileName('md')).toBe(false)
  })
})

describe('titleFromFileName', () => {
  it('확장자를 떼고 앞뒤 공백을 지운다', () => {
    expect(titleFromFileName('  재시도 정책 .md')).toBe('재시도 정책')
    expect(titleFromFileName('메모.txt')).toBe('메모')
    expect(titleFromFileName('a.b.markdown')).toBe('a.b')
  })

  it("제목에 쓸 수 없는 '/'는 '-'로 바꾼다", () => {
    expect(titleFromFileName('TCP/IP.md')).toBe('TCP-IP')
  })

  it('NFC로 정규화한다 (macOS 파일 이름은 NFD)', () => {
    expect(titleFromFileName('한글.md'.normalize('NFD'))).toBe('한글'.normalize('NFC'))
  })

  it('200자에서 자르고, 비면 "제목 없음"', () => {
    expect([...titleFromFileName(`${'가'.repeat(250)}.md`)]).toHaveLength(200)
    expect(titleFromFileName('.md')).toBe('제목 없음')
  })
})

describe('numberedTitle', () => {
  it('겹치지 않으면 그대로', () => {
    expect(numberedTitle('재시도 정책', new Set(['멱등성']))).toBe('재시도 정책')
  })

  it('겹치면 (1), 이미 (1)이 있으면 (2)', () => {
    expect(numberedTitle('재시도 정책', new Set(['재시도 정책']))).toBe('재시도 정책 (1)')
    expect(numberedTitle('재시도 정책', new Set(['재시도 정책', '재시도 정책 (1)']))).toBe(
      '재시도 정책 (2)',
    )
  })

  it('번호를 붙여도 200자를 넘지 않는다', () => {
    const base = '가'.repeat(200)
    const title = numberedTitle(base, new Set([base]))
    expect([...title]).toHaveLength(200)
    expect(title.endsWith(' (1)')).toBe(true)
  })
})

describe('decodeText', () => {
  it('UTF-8을 읽고 BOM을 뗀다', () => {
    expect(decodeText(encode('\uFEFF# 제목'))).toEqual({ ok: true, text: '# 제목' })
  })

  it('UTF-8이 아니면 이유를 준다', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41]).buffer)).toMatchObject({ ok: false })
  })

  it('100만 자를 넘으면 거절한다 (코드 포인트 기준)', () => {
    expect(decodeText(encode('a'.repeat(NOTE_BODY_MAX))).ok).toBe(true)
    expect(decodeText(encode('a'.repeat(NOTE_BODY_MAX + 1))).ok).toBe(false)
    // 이모지 하나는 UTF-16 두 단위지만 한 글자로 센다
    expect(decodeText(encode('😀'.repeat(NOTE_BODY_MAX))).ok).toBe(true)
  })
})

describe('formatSize', () => {
  it('KB로 반올림하고 1 KB보다 작아도 1 KB', () => {
    expect(formatSize(10)).toBe('1 KB')
    expect(formatSize(4 * 1024 + 100)).toBe('4 KB')
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
