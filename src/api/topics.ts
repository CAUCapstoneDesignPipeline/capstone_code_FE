import { request } from './client'
import type { Topic, TopicCreate, TopicList, TopicUpdate } from './types'

const topicPath = (topicId: string) => `/topics/${encodeURIComponent(topicId)}`

export function listTopics(signal?: AbortSignal): Promise<TopicList> {
  return request('GET', '/topics', { signal })
}

export function createTopic(input: TopicCreate): Promise<Topic> {
  return request('POST', '/topics', { body: input })
}

/** 이름만 바꾼다. 순서는 reorderTopics */
export function updateTopic(topicId: string, input: TopicUpdate): Promise<Topic> {
  return request('PATCH', topicPath(topicId), { body: input })
}

/**
 * 모든 주제 id를 원하는 순서대로 보낸다. 서버가 0부터 sortOrder를 다시 매긴다.
 * 그 사이 다른 곳에서 주제가 추가·삭제됐으면 TOPIC_ORDER_CONFLICT (details.current에 현재 목록).
 */
export function reorderTopics(topicIds: string[]): Promise<TopicList> {
  return request('PUT', '/topics/order', { body: { topicIds } })
}

/** 소속 노트는 미분류로 옮겨진다. 미분류에 같은 제목이 있으면 NOTE_TITLE_TAKEN */
export function deleteTopic(topicId: string): Promise<void> {
  return request('DELETE', topicPath(topicId))
}
