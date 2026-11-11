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

/**
 * 그래프 범위. all = 사용자의 모든 페이지, topic = 한 주제의 페이지 (topicId 'none'이면 미분류).
 * 없는 주제는 404 NOT_FOUND, 잘못된 scope·topicId는 400 VALIDATION_FAILED (BE PR #108).
 */
export type GraphScope = { scope: 'all' } | { scope: 'topic'; topicId: string | 'none' }

/**
 * 페이지 그래프 (v0.4.0-draft · docs PR #22, Figma W3-13). 노드 = 페이지(공유 키워드가 없는 페이지도 온다),
 * 선 = 같은 키워드를 공유하는 두 페이지 (무방향, 쌍마다 1개, sharedKeywords는 이름순).
 */
export function getGraph(
  scope: GraphScope = { scope: 'all' },
  signal?: AbortSignal,
): Promise<Graph> {
  const query =
    scope.scope === 'topic' ? { scope: 'topic', topicId: scope.topicId } : { scope: 'all' }
  return request('GET', '/graph', { query, signal })
}
