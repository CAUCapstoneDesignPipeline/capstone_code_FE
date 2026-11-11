// openapi.yaml에서 만든 타입(schema.gen.ts)에 짧은 이름을 붙인다. schema.gen.ts는 직접 고치지 않고 `npm run gen:api`로 다시 만든다.
import type { components } from './schema.gen'

type Schemas = components['schemas']

export type Topic = Schemas['Topic']
export type TopicList = Schemas['TopicList']
export type TopicCreate = Schemas['TopicCreate']
export type TopicUpdate = Schemas['TopicUpdate']
export type TopicOrder = Schemas['TopicOrder']

export type Note = Schemas['Note']
export type NoteSummary = Schemas['NoteSummary']
export type NoteCreate = Schemas['NoteCreate']
export type NoteUpdate = Schemas['NoteUpdate']

/**
 * AI 기능 사용 가능 여부 (GET /capabilities, AI-off 계약). 생성 타입은 지금 값인 false로 고정돼 있어
 * 키는 계약을 따르고 값은 나중에 켜질 것을 생각해 boolean으로 넓힌다.
 */
export type Capabilities = { [K in keyof Schemas['Capabilities']]: boolean }

// 분석·그래프는 계약이 아직 draft다 (x-contract-status: draft).
export type AnalysisJob = Schemas['AnalysisJob']
export type AnalysisStatus = AnalysisJob['status']

/**
 * 페이지 그래프 (GET /graph, docs PR #17 v0.4.0-draft · Figma W3-13).
 * 노드 = 페이지(노트), 선 = 같은 키워드를 공유하는 두 페이지. 계약이 확정되면 그대로 쓴다.
 */
export type Graph = Schemas['Graph']
export type GraphNode = Schemas['GraphNode']
export type GraphEdge = Schemas['GraphEdge']

// 사용자가 모르는 지식 추천 (v0.4.0-draft · Figma W3-02·W3-07~09·W3-12)
/**
 * 추천 카드의 상태 (11/04 회의). 계약 반영 전 가정 필드다 — openapi.yaml에 아직 없어 FE에서 먼저 가정한다.
 * - current: 그대로 성립한다
 * - stale: 다시 분석한 뒤 근거(키워드·개념)가 바뀌었다. 답하면 409
 * - evidence_lost: 근거 문장이 지워졌다
 */
export type RecommendationStatus = 'current' | 'stale' | 'evidence_lost'

/** 생성 타입에 계약 반영 전 가정 필드(status·revision)를 덧붙인 추천 */
export type Recommendation = Schemas['Recommendation'] & {
  /** 계약 반영 전 가정 필드. 없으면 current로 본다 */
  status?: RecommendationStatus
  /**
   * 계약 반영 전 가정 필드. 없으면 0으로 본다. 같은 추천이 근거만 바뀌고 여전히 성립하면
   * BE가 같은 id에 더 큰 revision으로 준다.
   */
  revision?: number
}
export type RecommendationJob = Omit<Schemas['RecommendationJob'], 'recommendations'> & {
  recommendations: Recommendation[]
}
export type RecommendationEvidence = Schemas['RecommendationEvidence']
export type ExternalKnowledge = Schemas['ExternalKnowledge']
export type RecommendationFeedback = Schemas['RecommendationFeedback']

export type AuthProvider = Schemas['AuthProvider']
export type AuthProviderList = Schemas['AuthProviderList']
export type Me = Schemas['Me']
export type TokenResponse = Schemas['TokenResponse']
export type DevTokenRequest = Schemas['DevTokenRequest']

export type ErrorBody = Schemas['Error']
/**
 * 서버가 돌려주는 오류 코드. 계약(openapi.yaml)의 코드에 BE가 이미 쓰는 코드를 더했다.
 * - FORBIDDEN: /auth/refresh·/auth/logout의 Origin이 앱 주소가 아님, CORS 거부
 * - NOTE_DELETE_BLOCKED: AI 근거가 연결된 노트 삭제
 */
export type ServerErrorCode = ErrorBody['error']['code'] | 'FORBIDDEN' | 'NOTE_DELETE_BLOCKED'
