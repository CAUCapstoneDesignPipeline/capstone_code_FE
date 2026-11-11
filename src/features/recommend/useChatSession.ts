import { useCallback, useRef, useState } from 'react'
import { streamRecommendationChat } from '../../api'
import {
  dropInterruptedTurn,
  FIRST_QUESTION,
  newConversation,
  runChatTurn,
  type ChatConversation,
  type ChatNotice,
} from './chatConversation'

/**
 * 추천 챗봇 대화와 스트림 (W3-03, docs PR #22). 카드별 대화 하나를 들고, 한 번에 답 하나만 받는다.
 * - open: "이해가 안 됨"을 누른 카드의 대화를 연다. 같은 카드면 이어 가고, 대화가 비어 있으면 FIRST_QUESTION을 보낸다.
 * - stop: 답 받기를 끊는다(중지·화면 이탈). BE가 AI 호출도 멈춘다. 받은 데까지는 남는다.
 * BE가 대화를 저장하지 않으므로 새로 고치면 대화가 사라진다.
 */
export function useChatSession() {
  const [conversation, setConversation] = useState<ChatConversation | null>(null)
  const [notice, setNotice] = useState<ChatNotice | null>(null)
  const [streaming, setStreaming] = useState(false)
  const controller = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setStreaming(false)
  }, [])

  const ask = useCallback(async (question: string, base: ChatConversation) => {
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    setNotice(null)
    setStreaming(true)
    const result = await runChatTurn({
      conversation: base,
      history: base.messages,
      question,
      update: (change) =>
        // 그 사이 다른 카드의 대화로 바뀌었으면 건드리지 않는다
        setConversation((cur) => (cur?.conversationId === base.conversationId ? change(cur) : cur)),
      stream: streamRecommendationChat,
      signal: c.signal,
    })
    // 끊었거나(stop) 새 질문을 보냈으면 이 결과는 보이지 않는다
    if (controller.current !== c) return
    controller.current = null
    setStreaming(false)
    setNotice(result)
  }, [])

  /** 카드의 챗봇을 연다 */
  const open = useCallback(
    (recommendationId: string) => {
      const base =
        conversation?.recommendationId === recommendationId
          ? conversation
          : newConversation(recommendationId)
      if (base !== conversation) {
        stop()
        setNotice(null)
        setConversation(base)
      }
      if (base.messages.length === 0 && !streaming) void ask(FIRST_QUESTION, base)
    },
    [conversation, streaming, ask, stop],
  )

  /** 질문을 보낸다 */
  const send = useCallback(
    (question: string) => {
      if (conversation && !streaming) void ask(question, conversation)
    },
    [conversation, streaming, ask],
  )

  /** 다시 시도: 끊긴 답이 있으면 그 답과 질문을 빼고 다시 묻는다 */
  const retry = useCallback(
    (question: string) => {
      if (!conversation) return
      void ask(question, { ...conversation, messages: dropInterruptedTurn(conversation.messages) })
    },
    [conversation, ask],
  )

  /** 대화가 너무 길 때: 새 대화로 처음 질문부터 다시 시작한다 */
  const restart = useCallback(() => {
    if (!conversation) return
    const fresh = newConversation(conversation.recommendationId)
    setConversation(fresh)
    void ask(FIRST_QUESTION, fresh)
  }, [conversation, ask])

  return { conversation, notice, streaming, open, send, stop, retry, restart }
}

export type ChatSession = ReturnType<typeof useChatSession>
