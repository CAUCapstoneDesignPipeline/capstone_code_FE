// 노트 가져오기 (Figma W3-04~06, docs team/current-decisions.md P01·U03).
// 파일을 앱에서 읽어 POST /notes로 하나씩 만든다. 서버에 따로 가져오기 API를 두지 않는다.
// 제목·본문 규칙은 openapi.yaml 공통 규칙과 같다.

import { normalizeName, NOTE_TITLE_MAX, UNTITLED } from '../../lib/names'

/** openapi.yaml Note.body maxLength (코드 포인트) */
export const NOTE_BODY_MAX = 1_000_000

/** 가져올 수 있는 형식 (W3-04: .md · .txt). 본문은 그대로 Markdown으로 넣는다. */
const EXTENSIONS = ['.md', '.markdown', '.txt']
export const ACCEPT = '.md,.markdown,.txt,text/markdown,text/plain'
export const FORMATS_LABEL = '.md · .txt'

const EXTENSION_PATTERN = /\.(md|markdown|txt)$/i

export function isImportableFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * 파일 이름으로 노트 제목을 만든다 (W3-04: 파일 이름에서 확장자를 뺀 것).
 * 제목에 쓸 수 없는 '/'는 '-'로 바꾸고 200자에서 자른다. 남는 글자가 없으면 "제목 없음".
 */
export function titleFromFileName(name: string): string {
  const title = normalizeName(name.replace(EXTENSION_PATTERN, '').replaceAll('/', '-'))
  if (!title) return UNTITLED
  return truncate(title, NOTE_TITLE_MAX)
}

function truncate(text: string, max: number): string {
  const chars = [...text]
  return chars.length <= max ? text : chars.slice(0, max).join('').trim()
}

/**
 * 같은 주제에 이미 있는 제목이면 뒤에 " (1)", " (2)" …를 붙인다 (W3-06: 이미 (1)이 있으면 (2)).
 * 번호를 붙여도 200자를 넘지 않게 앞부분을 줄인다.
 */
export function numberedTitle(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 1; ; n++) {
    const suffix = ` (${n})`
    const title = `${truncate(base, NOTE_TITLE_MAX - suffix.length)}${suffix}`
    if (!taken.has(title)) return title
  }
}

export type DecodeResult = { ok: true; text: string } | { ok: false; reason: string }

/** UTF-8로 읽는다. 앞의 BOM은 뗀다. UTF-8이 아니거나 본문이 너무 길면 이유를 돌려준다. */
export function decodeText(bytes: ArrayBuffer): DecodeResult {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, reason: 'UTF-8로 저장된 파일만 가져올 수 있습니다.' }
  }
  if (text.startsWith('\uFEFF')) text = text.slice(1)
  if (countCodePoints(text) > NOTE_BODY_MAX) {
    return {
      ok: false,
      reason: '본문이 너무 길어 가져오지 않습니다. 100만 자까지 가져올 수 있습니다.',
    }
  }
  return { ok: true, text }
}

function countCodePoints(text: string): number {
  let n = 0
  for (const _ of text) n++
  return n
}

/** 파일 크기 표시 (W3-04: "4 KB"). 1 KB보다 작아도 1 KB로 보인다. */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 고른 파일 하나 (W3-04 FileRow). reason이 있으면 가져오지 않고 목록에만 남긴다. */
export interface PickedFile {
  key: string
  fileName: string
  size: number
  /** 읽지 못했으면 null */
  body: string | null
  /** 가져오지 않는 이유 (지원하지 않는 형식, UTF-8 아님, 너무 김) */
  reason: string | null
}

export const UNSUPPORTED_REASON = '지원하지 않는 형식이라 가져오지 않습니다.'
