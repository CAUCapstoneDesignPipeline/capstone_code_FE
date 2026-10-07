// openapi.yaml에서 만든 타입(schema.gen.ts)에 짧은 이름을 붙인다. schema.gen.ts는 직접 고치지 않고 `npm run gen:api`로 다시 만든다.
import type { components } from './schema.gen'

type Schemas = components['schemas']

export type Topic = Schemas['Topic']
export type TopicList = Schemas['TopicList']
export type TopicCreate = Schemas['TopicCreate']
export type TopicUpdate = Schemas['TopicUpdate']

export type Note = Schemas['Note']
export type NoteSummary = Schemas['NoteSummary']
export type NoteCreate = Schemas['NoteCreate']
export type NoteUpdate = Schemas['NoteUpdate']

export type ErrorBody = Schemas['Error']
/** 계약에 정의된 오류 코드 */
export type ServerErrorCode = ErrorBody['error']['code']
