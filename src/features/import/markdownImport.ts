// Markdown 여러 파일 가져오기 (docs team/current-decisions.md P01·U03).
// 파일을 앱에서 읽어 POST /notes로 하나씩 만든다. 서버에 따로 가져오기 API를 두지 않는다.
// 제목·본문 규칙은 openapi.yaml 공통 규칙과 같다. 서버도 같은 검사를 하지만, 보내기 전에 파일별 이유를 보여주려고 앱에서도 검사한다.

import { checkName, normalizeName, NOTE_TITLE_MAX, UNTITLED } from '../../lib/names'

/** openapi.yaml Note.body maxLength (코드 포인트) */
export const NOTE_BODY_MAX = 1_000_000

const MARKDOWN_EXTENSIONS = ['.md', '.markdown']

export function isMarkdownFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * 파일 이름으로 기본 제목을 만든다. 확장자를 떼고, 제목에 쓸 수 없는 '/'는 '-'로 바꾸고, 200자에서 자른다.
 * 남는 글자가 없으면 "제목 없음".
 */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.(md|markdown)$/i, '')
  const title = normalizeName(base.replaceAll('/', '-'))
  if (!title) return UNTITLED
  return [...title].slice(0, NOTE_TITLE_MAX).join('').trim()
}

export type DecodeResult = { ok: true; text: string } | { ok: false; reason: string }

/** UTF-8로 읽는다. 앞의 BOM은 뗀다. UTF-8이 아니거나 본문이 너무 길면 이유를 돌려준다. */
export function decodeMarkdown(bytes: ArrayBuffer): DecodeResult {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, reason: 'UTF-8로 저장된 파일만 가져올 수 있습니다.' }
  }
  if (text.startsWith('﻿')) text = text.slice(1)
  if (countCodePoints(text) > NOTE_BODY_MAX) {
    return { ok: false, reason: '본문이 너무 깁니다. 100만 자까지 가져올 수 있습니다.' }
  }
  return { ok: true, text }
}

function countCodePoints(text: string): number {
  let n = 0
  for (const _ of text) n++
  return n
}

export type ImportStatus = 'ready' | 'importing' | 'done' | 'failed'

export interface ImportItem {
  key: string
  fileName: string
  title: string
  /** null이면 미분류 */
  topicId: string | null
  /** 읽지 못했으면 null (readError에 이유) */
  body: string | null
  readError: string | null
  status: ImportStatus
  /** 서버가 거절한 이유 (error.message 그대로) */
  error: string | null
  /** 만든 노트 */
  noteId: string | null
}

/**
 * 보내기 전에 막아야 할 이유. 없으면 null.
 * - 읽지 못한 파일, 제목 규칙 위반
 * - 이번에 가져오는 파일끼리 같은 주제에 같은 제목 (서버의 같은 주제 제목 중복 규칙). 서버에 이미 있는 제목은 서버가 알려준다.
 * 이미 가져온 파일은 검사하지 않는다.
 */
export function blockingReason(item: ImportItem, all: readonly ImportItem[]): string | null {
  if (item.status === 'done') return null
  if (item.readError) return item.readError
  const titleError = checkName(item.title, '제목', NOTE_TITLE_MAX)
  if (titleError) return titleError
  const title = normalizeName(item.title)
  const clash = all.find(
    (other) =>
      other.key !== item.key &&
      !other.readError &&
      other.topicId === item.topicId &&
      normalizeName(other.title) === title,
  )
  if (!clash) return null
  return clash.status === 'done'
    ? '방금 가져온 노트와 같은 주제에 같은 제목입니다.'
    : '가져올 파일 중 같은 주제에 같은 제목이 있습니다.'
}

/** 이번에 보낼 파일: 아직 가져오지 않았고(대기·실패) 막을 이유가 없는 것 */
export function sendable(items: readonly ImportItem[]): ImportItem[] {
  return items.filter(
    (item) =>
      (item.status === 'ready' || item.status === 'failed') && blockingReason(item, items) === null,
  )
}

/** 첫 몇 줄 미리보기. 마크다운 원문 그대로 보여준다. */
export function previewLines(body: string, maxLines = 12): { text: string; more: boolean } {
  const lines = body.split(/\r?\n/)
  return { text: lines.slice(0, maxLines).join('\n'), more: lines.length > maxLines }
}
