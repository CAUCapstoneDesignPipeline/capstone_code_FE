import { request } from './client'
import type { AnalysisJob, NoteGraph } from './types'

const analysisPath = (noteId: string) => `/notes/${encodeURIComponent(noteId)}/analysis`

/** 이 노트를 근거로 가진 개념·관계 (draft, F-GRA-03). relations[].evidence에는 이 노트의 구간만 온다. */
export function getNoteGraph(noteId: string, signal?: AbortSignal): Promise<NoteGraph> {
  return request('GET', `/notes/${encodeURIComponent(noteId)}/graph`, { signal })
}

/** 가장 최근 분석 작업 (draft, F-ANL-01). 분석한 적이 없으면 null */
export async function getNoteAnalysis(
  noteId: string,
  signal?: AbortSignal,
): Promise<AnalysisJob | null> {
  const res = await request<{ job: AnalysisJob | null }>('GET', analysisPath(noteId), { signal })
  return res.job
}

/** 지금 version으로 분석을 요청한다 (draft). 대기·진행 중인 작업이 있으면 그 작업이 온다. */
export function requestNoteAnalysis(noteId: string): Promise<AnalysisJob> {
  return request('POST', analysisPath(noteId))
}
