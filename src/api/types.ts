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
