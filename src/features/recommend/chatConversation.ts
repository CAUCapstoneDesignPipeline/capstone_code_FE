// 추천 챗봇 대화 (W3-03, docs PR #22). BE가 대화를 저장하지 않으므로 FE가 대화를 들고 매번 모두 보낸다.
// 새로 고치면 대화는 사라진다.
import {
  isApiError,
  type RecommendationChatEvent,
  type RecommendationChatMessage,
  type RecommendationChatRequest,
} from '../../api'

export interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  /** 문단은 빈 줄로 나눈다. 챗봇 답은 받는 대로 늘어난다 */
  text: string
  /** 챗봇 답이 끝나지 않고 멈췄다(중지·끊김). 받은 데까지는 남긴다 */
  interrupted?: boolean
}

/** 카드 하나와의 대화. 다른 카드로 챗봇을 열면 새 대화다 */
export interface ChatConversation {
  recommendationId: string
  /** 추적용 id. BE가 start 이벤트로 돌려준다 */
  conversationId: string
  messages: ChatMessage[]
}

/** 대화 아래에 보이는 안내 */
export type ChatNotice =
  /** 413 CHAT_INPUT_TOO_LARGE 또는 메시지 수 한도: 새 대화로 다시 시작한다 */
  | { kind: 'too_large' }
  /** 503 AI_UNAVAILABLE */
  | { kind: 'unavailable'; retryText: string }
  /** 답이 중간에 끊김 (error 이벤트 CHAT_INTERRUPTED 등). retryable이 아니면 retryText는 null */
  | { kind: 'interrupted'; retryText: string | null }
  /** 그 밖의 실패 (연결 실패 등) */
  | { kind: 'failed'; retryText: string }

/** 한 요청의 메시지 수 한도 (계약 maxItems) */
export const MAX_CHAT_MESSAGES = 40
/** 메시지 하나의 글자 수 한도 (계약 maxLength) */
export const MAX_CHAT_MESSAGE_CHARS = 4000

/**
 * "이해가 안 됨"으로 챗봇을 열면 먼저 보내는 질문. 계약상 대화는 user로 시작하므로,
 * 10/30 회의의 "챗봇이 쉽게 풀어 설명한다"를 이 질문으로 시작한다.
 */
export const FIRST_QUESTION = '이 추천을 쉽게 풀어 설명해 주세요.'

export function newConversation(recommendationId: string): ChatConversation {
  return { recommendationId, conversationId: crypto.randomUUID(), messages: [] }
}

/** history 뒤에 질문 하나를 더 보낼 수 있는지 (메시지 수 한도) */
export function canAsk(history: readonly ChatMessage[]): boolean {
  return history.length + 1 <= MAX_CHAT_MESSAGES
}

/** 보낼 messages: 지금까지의 대화(빈 답 제외) + 새 질문. user로 시작·끝나고 번갈아 나온다 */
export function requestMessages(
  history: readonly ChatMessage[],
  question: string,
): RecommendationChatMessage[] {
  return [
    ...history
      .filter((m) => m.text !== '')
      .map((m) => ({ role: m.role, content: m.text.slice(0, MAX_CHAT_MESSAGE_CHARS) })),
    { role: 'user', content: question },
  ]
}

/** 다시 시도할 때: 마지막이 끊긴 답이면 그 답과 질문을 빼고 다시 묻는다 */
export function dropInterruptedTurn(messages: readonly ChatMessage[]): ChatMessage[] {
  const last = messages.at(-1)
  return last?.role === 'assistant' && last.interrupted ? messages.slice(0, -2) : [...messages]
}

/** 끊긴 스트림이 준 error 이벤트 */
export class ChatStreamError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, retryable: boolean) {
    super(code)
    this.code = code
    this.retryable = retryable
  }
}

type Update = (change: (c: ChatConversation) => ChatConversation) => void
type Stream = (
  recommendationId: string,
  body: RecommendationChatRequest,
  signal: AbortSignal,
) => AsyncIterable<RecommendationChatEvent>

/**
 * 질문 하나를 보내고 답을 받는 대로 대화에 붙인다.
 * - 질문과 빈 답을 바로 대화에 넣고, delta가 올 때마다 답에 이어 붙인다.
 * - 글이 하나도 오기 전에 실패·중지하면 질문과 빈 답을 뺀다 (대화가 번갈아 나오게).
 * - 글이 온 뒤에 실패·중지하면 받은 데까지 남기고 끊긴 답으로 표시한다.
 * 돌려주는 값은 보일 안내다. 성공했거나 사용자가 끊었으면(signal) null.
 */
export async function runChatTurn({
  conversation,
  history,
  question,
  update,
  stream,
  signal,
}: {
  conversation: ChatConversation
  history: readonly ChatMessage[]
  question: string
  update: Update
  stream: Stream
  signal: AbortSignal
}): Promise<ChatNotice | null> {
  if (!canAsk(history)) return { kind: 'too_large' }
  const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: question }
  const reply: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', text: '' }
  const editReply = (edit: (m: ChatMessage) => ChatMessage) =>
    update((c) => ({ ...c, messages: c.messages.map((m) => (m.id === reply.id ? edit(m) : m)) }))
  update((c) => ({ ...c, messages: [...history, user, reply] }))

  let received = false
  try {
    const body = {
      conversationId: conversation.conversationId,
      messages: requestMessages(history, question),
    }
    for await (const event of stream(conversation.recommendationId, body, signal)) {
      if (event.type === 'delta') {
        received = true
        editReply((m) => ({ ...m, text: m.text + event.text }))
      } else if (event.type === 'error') {
        throw new ChatStreamError(event.code, event.retryable)
      } else if (event.type === 'done') {
        return null
      }
    }
    return null
  } catch (e) {
    if (received) editReply((m) => ({ ...m, interrupted: true }))
    else
      update((c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== user.id && m.id !== reply.id),
      }))
    if (signal.aborted) return null
    if (isApiError(e, 'CHAT_INPUT_TOO_LARGE')) return { kind: 'too_large' }
    if (isApiError(e, 'AI_UNAVAILABLE')) return { kind: 'unavailable', retryText: question }
    if (e instanceof ChatStreamError)
      return { kind: 'interrupted', retryText: e.retryable ? question : null }
    return { kind: 'failed', retryText: question }
  }
}

/** 안내 문구. Figma에 챗봇 실패 화면이 없어 계약 예시와 기존 말투를 따른다 */
export const CHAT_NOTICE_TEXT: Record<ChatNotice['kind'], { title: string; description: string }> =
  {
    too_large: {
      title: '대화가 너무 깁니다',
      description: '새 대화로 다시 시작해 주세요.',
    },
    unavailable: {
      title: '챗봇을 지금 사용할 수 없습니다',
      description: '잠시 후 다시 시도하세요.',
    },
    interrupted: {
      title: '답변이 중간에 끊겼습니다',
      description: '다시 시도하거나 새 질문을 입력하세요.',
    },
    failed: {
      title: '답을 받지 못했습니다',
      description: '연결을 확인하고 다시 시도하세요.',
    },
  }
