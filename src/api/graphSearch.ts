// Galaxy 그래프 검색 — 주제·키워드 이름으로 찾고 경로를 받는다 (FE #44, BE #144).
//
// ⚠ 계약 반영 전 가정: docs `api/openapi.yaml`에 아직 없다. BE #144 본문 "작업 내용"의 응답 예시를 기준으로 FE가 모양을 정했다.
// docs 계약이 나오면 이 파일(타입·경로)만 바꾼다. 가정한 필드는 PR 설명의 표와 TODO.md에 있다.
// 그 전까지 mock(`npm run mock -- --galaxy-demo`)만 이 경로를 준다. 지금 BE는 404.
import { request } from './client'

/** 경로의 한 칸 (주제) */
export interface GraphSearchPathStep {
  id: string
  name: string
}

/** 검색 결과 하나. 같은 이름이 여러 경로에 있으면 결과도 따로 온다 */
export interface GraphSearchResult {
  kind: 'topic' | 'keyword'
  id: string
  name: string
  /** extracted = 노트에서 뽑음, generated = 추천을 "이해함"으로 받아 들어옴 (◆). 주제는 extracted. 가정 */
  origin: 'extracted' | 'generated'
  /**
   * 최상위 주제부터 그 노드가 속한 주제까지. 주제 결과면 자기 자신은 빼고(최상위 주제면 빈 배열),
   * 키워드면 바로 속한 주제까지. 미분류 키워드는 [{ id: 'none', name: '미분류' }] (#143의 미분류와 같은 표기). 가정
   */
  path: GraphSearchPathStep[]
}

export interface GraphSearchResponse {
  results: GraphSearchResult[]
}

/** 한 번에 받는 결과 수 (BE #144 "기본 20 정도") */
export const GRAPH_SEARCH_LIMIT = 20

/**
 * Galaxy 검색. 이름 일부 일치·대소문자 무시, 주제 먼저 → 키워드 (BE #144 제안).
 * 빈 q는 400 VALIDATION_FAILED라 부르는 쪽이 보내지 않는다. 경로 없음(지금 BE)은 404 NOT_FOUND.
 */
export function searchGraph(q: string, signal?: AbortSignal): Promise<GraphSearchResponse> {
  return request('GET', '/graph/search', {
    query: { q, limit: String(GRAPH_SEARCH_LIMIT) },
    signal,
  })
}
