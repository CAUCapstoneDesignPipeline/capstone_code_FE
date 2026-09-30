import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  createNote,
  createTopic,
  deleteTopic,
  getNote,
  isApiError,
  listNotes,
  listTopics,
  moveNote,
  updateTopic,
  type Note,
  type NoteSummary,
  type Topic,
  type TopicCreate,
  type TopicList,
} from '../api'
import { nextUntitledTitle } from '../lib/names'

/**
 * 쿼리 키. 목록('notes')과 한 건('note')을 나눠 두어, 목록을 새로 고쳐도 편집 중인 노트는 다시 불러오지 않는다.
 * topicId가 null이면 미분류.
 */
export const keys = {
  topics: ['topics'] as const,
  noteLists: ['notes'] as const,
  notesIn: (topicId: string | null) => ['notes', 'in', topicId ?? 'none'] as const,
  search: (q: string) => ['notes', 'search', q] as const,
  notes: ['note'] as const,
  note: (noteId: string) => ['note', noteId] as const,
}

export function useTopics() {
  return useQuery({ queryKey: keys.topics, queryFn: ({ signal }) => listTopics(signal) })
}

export function useNotesIn(topicId: string | null) {
  return useQuery({
    queryKey: keys.notesIn(topicId),
    queryFn: ({ signal }) => listNotes({ topicId }, signal),
  })
}

/** 제목·본문 검색. 검색어가 바뀌는 동안에는 이전 결과를 그대로 보여준다. */
export function useSearchNotes(q: string) {
  return useQuery({
    queryKey: keys.search(q),
    queryFn: ({ signal }) => listNotes({ q }, signal),
    enabled: q !== '',
    placeholderData: keepPreviousData,
  })
}

/** 편집기가 쓰는 노트 한 건. 편집을 시작한 뒤에는 편집기가 내용을 들고 있으므로 스스로 다시 불러오지 않는다. */
export function useNote(noteId: string) {
  return useQuery({
    queryKey: keys.note(noteId),
    queryFn: ({ signal }) => getNote(noteId, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

/** 저장된 노트를 캐시에 반영한다. 사이드바 목록의 제목도 다시 불러오지 않고 바로 바꾼다. */
export function useApplySavedNote() {
  const qc = useQueryClient()
  return useCallback(
    (note: Note) => {
      qc.setQueryData(keys.note(note.id), note)
      qc.setQueriesData<NoteSummary[]>({ queryKey: keys.noteLists }, (list) =>
        list?.map((n) =>
          n.id === note.id ? { ...n, title: note.title, updatedAt: note.updatedAt } : n,
        ),
      )
    },
    [qc],
  )
}

export function useCreateTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TopicCreate) => createTopic(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.topics }),
  })
}

/** 겹치지 않는 기본 제목으로 노트를 만든다. 그 사이 다른 곳에서 같은 제목을 만들었으면 다음 번호로 다시 시도한다. */
async function createUntitledNote(qc: QueryClient, topicId: string | null): Promise<Note> {
  const existing = await qc.fetchQuery({
    queryKey: keys.notesIn(topicId),
    queryFn: ({ signal }) => listNotes({ topicId }, signal),
    staleTime: 0,
  })
  const taken = new Set(existing.map((n) => n.title))
  for (let attempt = 0; ; attempt++) {
    const title = nextUntitledTitle(taken)
    try {
      return await createNote({ title, topicId })
    } catch (e) {
      if (!isApiError(e, 'NOTE_TITLE_TAKEN') || attempt >= 4) throw e
      taken.add(title)
    }
  }
}

export function useCreateUntitledNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (topicId: string | null) => createUntitledNote(qc, topicId),
    onSuccess: (note) => {
      qc.setQueryData(keys.note(note.id), note)
      void qc.invalidateQueries({ queryKey: keys.noteLists })
      void qc.invalidateQueries({ queryKey: keys.topics })
    },
  })
}

export function useRenameTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ topicId, name }: { topicId: string; name: string }) =>
      updateTopic(topicId, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.topics }),
  })
}

export interface SwapTopicInput {
  topic: Topic
  /** 자리를 바꿀 바로 위(up) 또는 아래(down) 주제 */
  neighbor: Topic
  direction: 'up' | 'down'
}

/**
 * 주제를 위·아래 이웃과 자리를 바꾼다. 두 주제의 sortOrder를 맞바꾸는 PATCH 두 번이라 한 번에 처리되지 않는다.
 * 화면은 먼저 바꿔 두고, 끝나면(실패해도) 서버 목록을 다시 불러와 맞춘다.
 */
export function useSwapTopicOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ topic, neighbor, direction }: SwapTopicInput) => {
      // sortOrder가 같으면 맞바꿔도 그대로이므로 한 칸 차이를 만든다.
      const topicOrder =
        topic.sortOrder === neighbor.sortOrder
          ? neighbor.sortOrder + (direction === 'up' ? -1 : 1)
          : neighbor.sortOrder
      await updateTopic(topic.id, { sortOrder: topicOrder })
      if (topicOrder === neighbor.sortOrder) {
        await updateTopic(neighbor.id, { sortOrder: topic.sortOrder })
      }
    },
    onMutate: async ({ topic, neighbor }) => {
      await qc.cancelQueries({ queryKey: keys.topics })
      qc.setQueryData<TopicList>(keys.topics, (data) => {
        if (!data) return data
        const list = [...data.topics]
        const i = list.findIndex((t) => t.id === topic.id)
        const j = list.findIndex((t) => t.id === neighbor.id)
        if (i < 0 || j < 0) return data
        ;[list[i], list[j]] = [list[j], list[i]]
        return { ...data, topics: list }
      })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.topics }),
  })
}

/** 소속 노트는 서버에서 미분류로 옮겨진다. 캐시에 있는 노트도 미분류로 바꿔 둔다. */
export function useDeleteTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (topicId: string) => deleteTopic(topicId),
    onSuccess: (_, topicId) => {
      qc.setQueriesData<Note>({ queryKey: keys.notes }, (note) =>
        note?.topicId === topicId ? { ...note, topicId: null } : note,
      )
      qc.removeQueries({ queryKey: keys.notesIn(topicId) })
      void qc.invalidateQueries({ queryKey: keys.noteLists })
      void qc.invalidateQueries({ queryKey: keys.topics })
    },
  })
}

export interface MoveNoteInput {
  noteId: string
  /** null이면 미분류로 */
  topicId: string | null
}

/**
 * 노트를 다른 주제로 옮긴다. 옮길 주제에 같은 제목이 있으면 NOTE_TITLE_TAKEN.
 * 제목·본문·version은 바뀌지 않으므로 캐시의 노트는 topicId만 바꾼다 (편집 중인 내용을 덮지 않는다).
 */
export function useMoveNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, topicId }: MoveNoteInput) => moveNote(noteId, topicId),
    onSuccess: (moved) => {
      qc.setQueryData<Note>(keys.note(moved.id), (note) =>
        note ? { ...note, topicId: moved.topicId } : note,
      )
      void qc.invalidateQueries({ queryKey: keys.noteLists })
      void qc.invalidateQueries({ queryKey: keys.topics })
    },
  })
}
