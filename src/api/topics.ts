import { request } from './client'
import type { Topic, TopicCreate, TopicList, TopicUpdate } from './types'

const topicPath = (topicId: string) => `/topics/${encodeURIComponent(topicId)}`

export function listTopics(signal?: AbortSignal): Promise<TopicList> {
  return request('GET', '/topics', { signal })
}

export function createTopic(input: TopicCreate): Promise<Topic> {
  return request('POST', '/topics', { body: input })
}

/** 보낸 필드만 바뀐다 */
export function updateTopic(topicId: string, input: TopicUpdate): Promise<Topic> {
  return request('PATCH', topicPath(topicId), { body: input })
}

/** 소속 노트는 미분류로 옮겨진다. 미분류에 같은 제목이 있으면 NOTE_TITLE_TAKEN */
export function deleteTopic(topicId: string): Promise<void> {
  return request('DELETE', topicPath(topicId))
}
