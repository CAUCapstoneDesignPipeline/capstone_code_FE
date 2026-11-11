import { describe, expect, it } from 'vitest'
import { ApiError, type RecommendationChatEvent, type RecommendationChatRequest } from '../../api'
import {
  dropInterruptedTurn,
  MAX_CHAT_MESSAGES,
  newConversation,
  runChatTurn,
  type ChatConversation,
  type ChatMessage,
} from './chatConversation'

const msg = (role: ChatMessage['role'], text: string, extra: Partial<ChatMessage> = {}) =>
  ({ id: crypto.randomUUID(), role, text, ...extra }) as ChatMessage

/** 대화 상태를 들고 runChatTurn을 부르는 작은 하네스 */
function harness(events: (RecommendationChatEvent | Error)[], history: ChatMessage[] = []) {
  let conversation: ChatConversation = { ...newConversation('rec-1'), messages: history }
  const sent: RecommendationChatRequest[] = []
  const snapshots: string[] = []
  const controller = new AbortController()
  const turn = (question: string) =>
    runChatTurn({
      conversation,
      history: conversation.messages,
      question,
      update: (change) => {
        conversation = change(conversation)
        snapshots.push(conversation.messages.at(-1)?.text ?? '')
      },
      stream: async function* (_id, body) {
        sent.push(body)
        for (const e of events) {
          if (e instanceof Error) throw e
          yield e
        }
      },
      signal: controller.signal,
    })
  return {
    turn,
    sent,
    snapshots,
    controller,
    get conversation() {
      return conversation
    },
  }
}

describe('추천 챗봇 대화', () => {
  it('답을 받는 대로 붙이고, 지금까지의 대화 전체와 conversationId를 보낸다', async () => {
    const h = harness(
      [
        { type: 'start', conversationId: 'c' },
        { type: 'delta', text: '같은 요청을' },
        { type: 'delta', text: ' 여러 번' },
        { type: 'done', stopReason: 'end_turn' },
      ],
      [msg('user', '첫 질문'), msg('assistant', '첫 답')],
    )
    expect(await h.turn('둘째 질문')).toBeNull()
    expect(h.sent[0]).toEqual({
      conversationId: h.conversation.conversationId,
      messages: [
        { role: 'user', content: '첫 질문' },
        { role: 'assistant', content: '첫 답' },
        { role: 'user', content: '둘째 질문' },
      ],
    })
    // 토큰 단위로 늘어난다
    expect(h.snapshots).toEqual(['', '같은 요청을', '같은 요청을 여러 번'])
    expect(h.conversation.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', '첫 질문'],
      ['assistant', '첫 답'],
      ['user', '둘째 질문'],
      ['assistant', '같은 요청을 여러 번'],
    ])
  })

  it('글이 온 뒤 error 이벤트면 받은 데까지 남기고 끊긴 답으로 표시한다', async () => {
    const h = harness([
      { type: 'delta', text: '반쯤' },
      { type: 'error', code: 'CHAT_INTERRUPTED', message: '끊김', retryable: true },
    ])
    expect(await h.turn('질문')).toEqual({ kind: 'interrupted', retryText: '질문' })
    expect(h.conversation.messages.at(-1)).toMatchObject({ text: '반쯤', interrupted: true })
    // 다시 시도하면 끊긴 답과 그 질문을 빼고 다시 묻는다
    expect(dropInterruptedTurn(h.conversation.messages)).toEqual([])
  })

  it('retryable이 아니면 다시 시도를 주지 않는다', async () => {
    const h = harness([{ type: 'error', code: 'CHAT_INTERRUPTED', message: '', retryable: false }])
    expect(await h.turn('질문')).toEqual({ kind: 'interrupted', retryText: null })
  })

  it('첫 글자 전의 실패는 질문과 빈 답을 빼고 코드별로 안내한다', async () => {
    const cases: [Error, unknown][] = [
      [new ApiError('CHAT_INPUT_TOO_LARGE', '', 413), { kind: 'too_large' }],
      [new ApiError('AI_UNAVAILABLE', '', 503), { kind: 'unavailable', retryText: '질문' }],
      [new ApiError('NETWORK_ERROR', '', 0), { kind: 'failed', retryText: '질문' }],
    ]
    for (const [error, notice] of cases) {
      const h = harness([error], [msg('user', 'a'), msg('assistant', 'b')])
      expect(await h.turn('질문')).toEqual(notice)
      expect(h.conversation.messages.map((m) => m.text)).toEqual(['a', 'b'])
    }
  })

  it('사용자가 끊으면(중지·화면 이탈) 안내하지 않는다. 받은 글은 남긴다', async () => {
    const h = harness([{ type: 'delta', text: '조금' }, new DOMException('aborted', 'AbortError')])
    h.controller.abort()
    expect(await h.turn('질문')).toBeNull()
    expect(h.conversation.messages.at(-1)).toMatchObject({ text: '조금', interrupted: true })
  })

  it('메시지 수 한도(40)를 넘기면 보내지 않고 새 대화를 안내한다', async () => {
    const history = Array.from({ length: MAX_CHAT_MESSAGES }, (_, i) =>
      msg(i % 2 ? 'assistant' : 'user', `m${i}`),
    )
    const h = harness([], history)
    expect(await h.turn('질문')).toEqual({ kind: 'too_large' })
    expect(h.sent).toEqual([])
  })
})
