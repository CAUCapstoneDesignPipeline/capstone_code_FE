import { request } from './client'
import type { Note, NoteCreate, NoteSummary, NoteUpdate } from './types'

const notePath = (noteId: string) => `/notes/${encodeURIComponent(noteId)}`

export interface ListNotesParams {
  /** 없으면 전체, null이면 미분류만 */
  topicId?: string | null
  /** 제목·본문 부분 일치. 빈 문자열이면 보내지 않는다. */
  q?: string
  sort?: 'title' | 'updated'
}

export async function listNotes(
  params: ListNotesParams = {},
  signal?: AbortSignal,
): Promise<NoteSummary[]> {
  const { topicId, q, sort } = params
  const res = await request<{ notes: NoteSummary[] }>('GET', '/notes', {
    query: {
      topicId: topicId === null ? 'none' : topicId,
      q: q || undefined,
      sort,
    },
    signal,
  })
  return res.notes
}

export function createNote(input: NoteCreate): Promise<Note> {
  return request('POST', '/notes', { body: input })
}

export function getNote(noteId: string, signal?: AbortSignal): Promise<Note> {
  return request('GET', notePath(noteId), { signal })
}

/** version이 서버와 다르면 NOTE_CONFLICT. 성공하면 version이 1 늘어난 노트가 온다. */
export function updateNote(noteId: string, input: NoteUpdate): Promise<Note> {
  return request('PUT', notePath(noteId), { body: input })
}

export function deleteNote(noteId: string): Promise<void> {
  return request('DELETE', notePath(noteId))
}

/** topicId가 null이면 미분류로. version은 바뀌지 않는다. */
export function moveNote(noteId: string, topicId: string | null): Promise<Note> {
  return request('PUT', `${notePath(noteId)}/topic`, { body: { topicId } })
}
