// @ts-check
// 추천 챗봇(POST /recommendations/{id}/chat, SSE, docs PR #22)을 흉내 낸다. 실제 답은 AI가 만든다.
// 답은 카드의 결론을 넣은 정해 둔 예시 문장이고, 몇 글자씩 나눠 delta로 보낸다.
// 마지막 질문에 '끊김'이 들어 있으면 글 몇 조각 뒤에 error 이벤트(CHAT_INTERRUPTED, retryable)로 끝난다.

/** 카드 + 대화의 AI 입력 한도 (글자). 넘으면 413 CHAT_INPUT_TOO_LARGE */
export const CHAT_INPUT_MAX_CHARS = 60_000
const MAX_MESSAGES = 40
const MAX_CONTENT = 4000

/**
 * 요청 본문을 검사한다. 틀리면 이유(field, reason)를, 맞으면 null.
 * messages는 1~40개, user로 시작·끝, user·assistant 번갈아, content 1~4,000자.
 * @param {unknown} input
 * @returns {{ field: string, reason: string } | null}
 */
export function invalidChatRequest(input) {
  const body = /** @type {{ messages?: unknown, conversationId?: unknown }} */ (
    typeof input === 'object' && input !== null ? input : {}
  )
  if (body.conversationId !== undefined && typeof body.conversationId !== 'string')
    return { field: 'conversationId', reason: 'invalid' }
  const messages = body.messages
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES)
    return { field: 'messages', reason: 'size' }
  for (const [i, m] of messages.entries()) {
    const role = i % 2 === 0 ? 'user' : 'assistant'
    if (typeof m !== 'object' || m === null || m.role !== role)
      return { field: `messages[${i}].role`, reason: 'order' }
    if (typeof m.content !== 'string' || m.content.length < 1 || m.content.length > MAX_CONTENT)
      return { field: `messages[${i}].content`, reason: 'size' }
  }
  if (messages.length % 2 === 0) return { field: 'messages', reason: 'order' }
  return null
}

/**
 * 보낼 SSE 이벤트들. conclusion은 카드의 결론이다.
 * @param {{ conversationId?: string, messages: { role: string, content: string }[] }} body
 * @param {string} conclusion
 * @returns {{ event: string, data: unknown }[]}
 */
export function chatEvents(body, conclusion) {
  const last = body.messages[body.messages.length - 1].content
  const turn = Math.ceil(body.messages.length / 2)
  const answer =
    turn === 1
      ? `쉽게 말하면, ${conclusion}\n\n두 노트의 근거 문장이 같은 키워드로 이어져 있어서 함께 보면 새로운 연결이 보입니다. (가짜 서버의 예시 답)`
      : `'${last.slice(0, 40)}'에 대한 예시 답입니다. 실제 답은 AI 챗봇이 카드의 근거를 바탕으로 만듭니다. (가짜 서버, ${turn}번째 답)`
  const chunks = answer.match(/[\s\S]{1,6}/g) ?? []
  const interrupt = last.includes('끊김')
  /** @type {{ event: string, data: unknown }[]} */
  const events = [
    { event: 'start', data: { conversationId: body.conversationId ?? crypto.randomUUID() } },
  ]
  for (const [i, text] of chunks.entries()) {
    if (interrupt && i === 4) {
      events.push({
        event: 'error',
        data: { code: 'CHAT_INTERRUPTED', message: '답변이 중간에 끊겼습니다.', retryable: true },
      })
      return events
    }
    events.push({ event: 'delta', data: { text } })
  }
  events.push({ event: 'done', data: { stopReason: 'end_turn' } })
  return events
}
