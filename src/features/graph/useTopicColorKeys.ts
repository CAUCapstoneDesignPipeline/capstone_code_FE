import { useEffect, useMemo } from 'react'
import type { Topic } from '../../api'
import {
  assignTopicSlots,
  topicColorKeys,
  type TopicColorKey,
  type TopicSlots,
} from '../../lib/topicColors'

const STORAGE_KEY = 'capstone.graph.topicSlots'

function readSlots(): TopicSlots {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return value && typeof value === 'object' ? (value as TopicSlots) : {}
  } catch {
    return {}
  }
}

/** 이 브라우저에서 마지막으로 정한 칸. 새로 고쳐도 주제 색이 그대로이게 저장해 둔다. */
let remembered: TopicSlots = readSlots()

/**
 * 주제 → 색 종류. 주제를 아직 불러오지 않았으면 null (그동안 그래프를 그리지 않아 회색으로 그렸다가 다시 칠하지 않는다).
 * 저장소를 쓸 수 없으면(사생활 보호 창 등) 만든 순서로만 정한다.
 */
export function useTopicColorKeys(
  topics: readonly Topic[] | undefined,
): ReadonlyMap<string, TopicColorKey> | null {
  const slots = useMemo(() => (topics ? assignTopicSlots(topics, remembered) : null), [topics])

  useEffect(() => {
    if (!slots) return
    remembered = slots
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slots))
    } catch {
      // 저장하지 못해도 이번 화면에서는 같은 색을 쓴다
    }
  }, [slots])

  return useMemo(() => (topics && slots ? topicColorKeys(topics, slots) : null), [topics, slots])
}
