// 챗봇 API가 계약에 아직 없어 Figma W3-03의 예시 대화를 쓴다. API가 생기면 이 파일을 지우고 응답으로 바꾼다.

export interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  /** 문단은 빈 줄로 나눈다 */
  text: string
}

/** "이해가 안 됨"을 누르면 챗봇이 먼저 추천을 쉽게 풀어 준다 */
export const SAMPLE_FIRST_MESSAGE: ChatMessage = {
  id: 'sample-first',
  role: 'assistant',
  text:
    '쉽게 말하면, 응답이 늦으면 클라이언트는 같은 요청을 한 번 더 보냅니다. 서버가 첫 요청을 이미 처리했다면 같은 쓰기가 두 번 일어나요.\n\n' +
    '멱등하게 만들면 두 번 처리돼도 결과가 한 번 처리한 것과 같아서 중복 행이 생기지 않습니다.',
}

const SAMPLE_ANSWERS = [
  '예를 들어 요청마다 고유한 ID를 붙이고, 서버가 이미 처리한 ID면 다시 쓰지 않고 이전 결과를 돌려주는 방식이 있어요.',
]

/** turn번째 질문(0부터)에 대한 예시 답 */
export function sampleAnswer(turn: number): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    text: SAMPLE_ANSWERS[turn] ?? '챗봇이 아직 연결되지 않아 예시 답만 보여 줍니다.',
  }
}
