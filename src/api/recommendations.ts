import { openStream, request } from './client'
import { readSse } from './sse'
import type { RecommendationChatRequest, RecommendationFeedback, RecommendationJob } from './types'

// 사용자가 모르는 지식 추천 (docs PR #17 v0.4.0-draft, BE 결정은 docs PR #22). 작업 id를 받고 결과를 polling한다.

/** 페이지의 현재 내용으로 추천 작업을 만든다. 끝나지 않은 작업이 있으면 그 작업을 준다 (202). */
export function requestRecommendationJob(noteId: string): Promise<RecommendationJob> {
  return request('POST', `/notes/${encodeURIComponent(noteId)}/recommendation-jobs`)
}

/**
 * 작업 상태와 결과. completed면 끝났고 outcome으로 끝난 이유를 구분한다 (11/4 결정, BE #74):
 * RECOMMENDED(추천 있음) · NO_RECOMMENDATIONS(추천 없음, 보류 포함) · RECOMMENDATION_FAILED(분석 실패, 시간 초과·취소 포함).
 */
export function getRecommendationJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<RecommendationJob> {
  return request('GET', `/recommendation-jobs/${encodeURIComponent(jobId)}`, { signal })
}

/**
 * 추천 카드의 답 (W3-02 버튼 3개). understood = 이해함, known = 알고 있던 내용, confused = 이해가 안 됨. 204.
 * 같은 답 재전송·confused 뒤 최종 답은 204다. 409는 두 가지다 (docs PR #22):
 * - REVIEW_CONFLICT: 최종 답(understood·known) 뒤 다른 답
 * - RECOMMENDATION_STALE: freshness가 stale·evidence_lost인 추천. 답은 기록되지 않는다
 */
export function sendRecommendationFeedback(
  recommendationId: string,
  action: RecommendationFeedback['action'],
): Promise<void> {
  return request('POST', `/recommendations/${encodeURIComponent(recommendationId)}/feedback`, {
    body: { action },
  })
}

/** 추천 챗봇 스트림의 이벤트 (docs PR #22). 이 넷뿐이다 */
export type RecommendationChatEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; code: string; message: string; retryable: boolean }

/** 글이 나온 뒤의 오류·중간에 끊긴 스트림 (error 이벤트의 code) */
export const CHAT_INTERRUPTED = 'CHAT_INTERRUPTED'

/**
 * "이해가 안 됨"을 누른 추천 카드로 챗봇과 대화한다 (POST /recommendations/{id}/chat, SSE).
 * POST라 EventSource 대신 fetch 스트림을 읽는다. 카드 내용은 BE가 채우므로 보내지 않는다.
 * 첫 글자 전의 오류는 ApiError로 던진다 (413 CHAT_INPUT_TOO_LARGE, 503 AI_UNAVAILABLE 등).
 * 그 뒤의 오류는 error 이벤트로 준다. done·error 없이 스트림이 끝나면 CHAT_INTERRUPTED error 이벤트를 만들어 준다.
 * signal로 끊으면 BE가 AI 호출도 멈춘다. 이때는 AbortError를 던진다.
 */
export async function* streamRecommendationChat(
  recommendationId: string,
  body: RecommendationChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<RecommendationChatEvent> {
  const res = await openStream(
    'POST',
    `/recommendations/${encodeURIComponent(recommendationId)}/chat`,
    { body, signal },
  )
  const interrupted: RecommendationChatEvent = {
    type: 'error',
    code: CHAT_INTERRUPTED,
    message: '답변이 중간에 끊겼습니다.',
    retryable: true,
  }
  if (!res.body) {
    yield interrupted
    return
  }
  try {
    for await (const m of readSse(res.body)) {
      const event = toChatEvent(m.event, m.data)
      if (!event) continue
      yield event
      if (event.type === 'done' || event.type === 'error') return
    }
  } catch (e) {
    if (signal?.aborted) throw e
    // 읽는 중 연결이 끊김
  }
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  yield interrupted
}

/** SSE 한 건을 이벤트로. 모르는 이벤트나 모양이 다른 data는 버린다 */
function toChatEvent(event: string, data: string): RecommendationChatEvent | null {
  let v: Record<string, unknown>
  try {
    v = JSON.parse(data) as Record<string, unknown>
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null) return null
  const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : null)
  switch (event) {
    case 'start':
      return { type: 'start', conversationId: str('conversationId') ?? '' }
    case 'delta': {
      const text = str('text')
      return text === null ? null : { type: 'delta', text }
    }
    case 'done':
      return { type: 'done', stopReason: str('stopReason') ?? '' }
    case 'error':
      return {
        type: 'error',
        code: str('code') ?? CHAT_INTERRUPTED,
        message: str('message') ?? '',
        retryable: v.retryable === true,
      }
    default:
      return null
  }
}
