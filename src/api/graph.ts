import { request } from './client'
import type { AnalysisJob, Graph } from './types'

const analysisPath = (noteId: string) => `/notes/${encodeURIComponent(noteId)}/analysis`

/** 가장 최근 분석 작업 (draft, F-ANL-01). 분석한 적이 없으면 null */
export async function getNoteAnalysis(
  noteId: string,
  signal?: AbortSignal,
): Promise<AnalysisJob | null> {
  const res = await request<{ job: AnalysisJob | null }>('GET', analysisPath(noteId), { signal })
  return res.job
}

/** 페이지 그래프 (v0.4.0-draft, Figma W3-13). 노드 = 페이지, 선 = 같은 키워드를 공유하는 두 페이지 */
export function getGraph(signal?: AbortSignal): Promise<Graph> {
  return request('GET', '/graph', { query: { scope: 'all' }, signal })
}
