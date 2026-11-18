// 주제(폴더) 단위 키워드 그래프 — Galaxy 그래프 (FE #44, BE #143).
//
// ⚠ 계약 반영 전 가정: docs `api/openapi.yaml`에 아직 없다. BE #143 본문 "작업 내용"의 응답 항목을 기준으로 FE가 모양을 정했다.
// docs 계약이 나오면 이 파일(타입·경로)만 바꾼다. 가정한 필드는 PR 설명의 표와 TODO.md에 있다.
// 주제 계층(parentId)은 BE #141이 정한다. 그 전까지 mock(`npm run mock -- --galaxy-demo`)만 이 경로를 준다.
import { request } from './client'

/** 이 단계에 보이는 하위 주제 (큰 원) */
export interface TopicGraphTopic {
  id: string
  name: string
  /** 그 주제와 모든 하위 주제의 키워드 수 (노드 크기) */
  keywordCount: number
  /** 하위 주제가 있는지 */
  hasChildren: boolean
  /** 바로 아래 하위 주제 수 ("하위 주제 2"). 가정 */
  childTopicCount: number
  /** 그 주제(하위 포함) 안에 추천으로 들어온 지식(origin=generated)이 있는지. 노드에 작은 점. 가정 */
  hasRecommended: boolean
}

/** 키워드에 연결된 문서(노트) */
export interface TopicGraphDocument {
  noteId: string
  title: string
}

/** 이 주제에 바로 속한 키워드 (작은 점) */
export interface TopicGraphKeyword {
  id: string
  label: string
  /** 개념(설명) 수 (노드 크기) */
  conceptCount: number
  /** extracted = 노트에서 뽑음, generated = 추천을 "이해함"으로 받아 들어옴 (◆, recommended 색) */
  origin: 'extracted' | 'generated'
  /** 바로 속한 주제. FE는 이 값이 지금 주제인 키워드만 그린다 (하위 주제의 키워드 제외). 가정 */
  topicId: string
  /** 키워드가 나온 문서. 키워드를 누르면 보인다 */
  documents: TopicGraphDocument[]
}

/** 노드 사이 연결 (키워드–키워드, 키워드–주제, 주제–주제). 방향 없음 */
export interface TopicGraphEdge {
  sourceId: string
  targetId: string
}

/** 한 단계의 그래프. 최상위면 topics만 있고 keywords는 빈 배열이다 */
export interface TopicGraph {
  topics: TopicGraphTopic[]
  keywords: TopicGraphKeyword[]
  edges: TopicGraphEdge[]
}

/**
 * 주제 단위 그래프. topicId가 null이면 최상위 주제만, 아니면 그 주제의 하위 주제 + 그 주제에 바로 속한 키워드.
 * 경로 없음(지금 BE)·없는 주제는 404 NOT_FOUND.
 */
export function getTopicGraph(topicId: string | null, signal?: AbortSignal): Promise<TopicGraph> {
  const path = topicId === null ? '/graph/topics' : `/graph/topics/${encodeURIComponent(topicId)}`
  return request('GET', path, { signal })
}
