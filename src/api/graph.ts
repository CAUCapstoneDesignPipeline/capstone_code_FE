import { request } from './client'
import type { NoteGraph } from './types'

/** 이 노트를 근거로 가진 개념·관계 (draft, F-GRA-03). relations[].evidence에는 이 노트의 구간만 온다. */
export function getNoteGraph(noteId: string, signal?: AbortSignal): Promise<NoteGraph> {
  return request('GET', `/notes/${encodeURIComponent(noteId)}/graph`, { signal })
}
