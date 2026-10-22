import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import {
  createNote,
  createTopic,
  deleteNote,
  deleteTopic,
  getNote,
  getNoteAnalysis,
  getNoteGraph,
  isApiError,
  listNotes,
  listTopics,
  moveNote,
  orderConflictCurrent,
  reorderTopics,
  requestNoteAnalysis,
  updateTopic,
  type AnalysisJob,
  type Note,
  type NoteSummary,
  type Topic,
  type TopicCreate,
  type TopicList,
} from '../api'
import { createAnalysisPoller, isAnalysisActive } from '../lib/analysisPoll'
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
  noteAnalysis: (noteId: string) => ['noteAnalysis', noteId] as const,
  noteGraph: (noteId: string) => ['noteGraph', noteId] as const,
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

/** 고른 노트의 주제 (사이드바에서 그 주제를 펼칠 때). 노트가 없으면 undefined */
export function useNoteTopicId(noteId: string | null): string | null | undefined {
  const note = useQuery({
    queryKey: keys.note(noteId ?? ''),
    queryFn: ({ signal }) => getNote(noteId!, signal),
    enabled: noteId !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  return noteId === null ? undefined : note.data?.topicId
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

/**
 * 노트의 가장 최근 분석 작업 (F-ANL-01). 대기·진행 중이거나, 저장한 version의 작업이 아직 안 보이는 동안 폴링한다.
 * 숨겨진 탭에서는 멈추고(refetchIntervalInBackground 기본값) 돌아오면 바로 다시 받는다(refetchOnWindowFocus).
 * 같은 노트에서 한 곳만 부른다 (부르는 곳마다 폴링 타이머가 따로 돈다).
 */
export function useNoteAnalysis(noteId: string) {
  const [nextPoll] = useState(() => createAnalysisPoller())
  // 편집기가 저장할 때마다 캐시의 version을 올린다 (useApplySavedNote).
  const savedVersion = useNote(noteId).data?.version
  return useQuery({
    queryKey: keys.noteAnalysis(noteId),
    queryFn: ({ signal }) => getNoteAnalysis(noteId, signal),
    refetchInterval: (query) =>
      // 노트가 지워졌으면 멈춘다
      isApiError(query.state.error, 'NOT_FOUND') ? false : nextPoll(query.state.data, savedVersion),
  })
}

/** 분석 다시 요청. 받은 작업으로 바로 바꿔 폴링을 다시 시작한다. */
export function useRequestAnalysis(noteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => requestNoteAnalysis(noteId),
    onSuccess: (job) => qc.setQueryData(keys.noteAnalysis(noteId), job),
  })
}

/** 노트 옆 패널의 개념·관계 (F-GRA-03) */
export function useNoteGraph(noteId: string) {
  return useQuery({
    queryKey: keys.noteGraph(noteId),
    queryFn: ({ signal }) => getNoteGraph(noteId, signal),
  })
}

/**
 * 저장된 노트를 캐시에 반영한다. 사이드바 목록의 제목도 다시 불러오지 않고 바로 바꾼다.
 * 저장하면 BE가 분석 작업을 만드므로, 폴링 중이 아니면 분석 상태를 다시 받아 폴링을 시작한다.
 */
export function useApplySavedNote() {
  const qc = useQueryClient()
  return useCallback(
    (note: Note) => {
      qc.setQueryData(keys.note(note.id), note)
      qc.setQueriesData<NoteSummary[]>({ queryKey: keys.noteLists }, (list) =>
        list?.map((n) =>
          n.id === note.id
            ? { ...n, title: note.title, version: note.version, updatedAt: note.updatedAt }
            : n,
        ),
      )
      const job = qc.getQueryData<AnalysisJob | null>(keys.noteAnalysis(note.id))
      if (!isAnalysisActive(job))
        void qc.invalidateQueries({ queryKey: keys.noteAnalysis(note.id) })
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
 * 주제를 위·아래 이웃과 자리를 바꾼다. 바뀐 전체 순서를 PUT /topics/order 한 요청으로 보낸다.
 * 화면은 먼저 바꿔 두고, 끝나면 서버 목록으로 맞춘다.
 * 그 사이 다른 곳에서 주제가 추가·삭제됐으면 TOPIC_ORDER_CONFLICT의 현재 목록으로 바로 바꾼다.
 */
export function useSwapTopicOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ topic, neighbor }: SwapTopicInput) => {
      const ids = (qc.getQueryData<TopicList>(keys.topics)?.topics ?? []).map((t) => t.id)
      // onMutate가 이미 자리를 바꿔 두었다. 캐시가 비었으면 두 주제만이라도 바꿔 보낸다 (서버가 409로 알려준다).
      return reorderTopics(ids.length ? ids : [neighbor.id, topic.id])
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
    onSuccess: (list) => qc.setQueryData(keys.topics, list),
    onError: (e) => {
      const current = isApiError(e, 'TOPIC_ORDER_CONFLICT') ? orderConflictCurrent(e) : undefined
      if (current) qc.setQueryData(keys.topics, current)
      else void qc.invalidateQueries({ queryKey: keys.topics })
    },
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
      // version은 그대로지만 근거의 주제가 바뀌어 BE가 다시 분석한다.
      void qc.invalidateQueries({ queryKey: keys.noteAnalysis(moved.id) })
      void qc.invalidateQueries({ queryKey: keys.noteLists })
      void qc.invalidateQueries({ queryKey: keys.topics })
    },
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noteId: string) => deleteNote(noteId),
    onSuccess: (_, noteId) => {
      qc.removeQueries({ queryKey: keys.note(noteId) })
      qc.removeQueries({ queryKey: keys.noteAnalysis(noteId) })
      qc.removeQueries({ queryKey: keys.noteGraph(noteId) })
      void qc.invalidateQueries({ queryKey: keys.noteLists })
      void qc.invalidateQueries({ queryKey: keys.topics })
    },
  })
}
