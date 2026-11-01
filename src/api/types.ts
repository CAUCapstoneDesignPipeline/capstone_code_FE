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
export type RecommendationJob = Schemas['RecommendationJob']
export type Recommendation = Schemas['Recommendation']
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
