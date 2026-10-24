import { request } from './client'
import type { AnalysisJob, Capabilities, Graph, NoteGraph } from './types'

const analysisPath = (noteId: string) => `/notes/${encodeURIComponent(noteId)}/analysis`

/** AI 기능(분석·그래프·발견)을 쓸 수 있는지. 로그인 없이 부를 수 있다. */
export function getCapabilities(signal?: AbortSignal): Promise<Capabilities> {
  return request('GET', '/capabilities', { signal })
}

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

/** 전체 그래프 (draft, F-VIZ-01). 노드의 notes는 계약 제안이다 (types.ts의 Graph). */
export function getGraph(signal?: AbortSignal): Promise<Graph> {
  return request('GET', '/graph', { query: { scope: 'all' }, signal })
}
