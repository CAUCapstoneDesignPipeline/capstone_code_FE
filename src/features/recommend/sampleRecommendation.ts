// 추천 API가 계약에 아직 없어 Figma W3-02의 예시를 그대로 쓴다. API가 생기면 이 파일을 지우고 응답으로 바꾼다.

/** 내 노트의 문장 하나. 저장된 원문 그대로다 (LLM이 다시 쓴 문장이 아니다). */
export interface NoteEvidence {
  kind: 'note'
  noteTitle: string
  topicName: string | null
  quote: string
}

/** 노트 밖에서 가져온 지식 */
export interface ExternalEvidence {
  kind: 'external'
  source: string
  quote: string
}

/** 새로운 지식 추천: 두 노트의 문장(A·B)과 외부 지식을 이어서 낸 결론 */
export interface Recommendation {
  a: NoteEvidence
  b: NoteEvidence
  external: ExternalEvidence
  conclusion: string
}

export const SAMPLE_RECOMMENDATION: Recommendation = {
  a: {
    kind: 'note',
    noteTitle: '재시도 정책',
    topicName: '네트워크',
    quote: '클라이언트는 응답 시간이 초과되면 요청을 재전송한다.',
  },
  b: {
    kind: 'note',
    noteTitle: '멱등성',
    topicName: '네트워크',
    quote: '멱등한 연산은 여러 번 실행해도 한 번 실행한 것과 결과가 같다.',
  },
  external: {
    kind: 'external',
    source: 'rfc-editor.org/rfc/rfc9110',
    quote: 'PUT·DELETE는 멱등 메서드로 정의되며, 실패 시 자동으로 재시도해도 된다.',
  },
  conclusion:
    '타임아웃 뒤 재전송된 요청이 중복 행을 만들지 않으려면, 쓰기 요청을 멱등하게 설계해야 한다.',
}
