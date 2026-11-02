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
  getCapabilities,
  getGraph,
  getNoteAnalysis,
  getRecommendationJob,
  isApiError,
  listNotes,
  listTopics,
  moveNote,
  orderConflictCurrent,
  reorderTopics,
  requestRecommendationJob,
  sendRecommendationFeedback,
  updateTopic,
  type AnalysisJob,
  type Capabilities,
  type Note,
  type NoteCreate,
  type NoteSummary,
  type RecommendationJob,
  type Topic,
  type TopicCreate,
  type TopicList,
} from '../api'
import { createAnalysisPoller, isAnalysisActive } from '../lib/analysisPoll'
import { resolveCapabilities } from '../lib/capabilities'
import type { RecommendationAnswer } from '../lib/recommendations'
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
  graph: ['graph'] as const,
  /** 노트의 가장 최근 추천 작업 (이 화면에서 요청한 것). 없으면 null */
  recommendationJob: (noteId: string) => ['recommendationJob', noteId] as const,
  /** 이 화면에서 추천 카드에 남긴 답 (추천 id → 답) */
  recommendationAnswers: ['recommendationAnswers'] as const,
  capabilities: ['capabilities'] as const,
}

/**
 * AI 기능을 쓸 수 있는지 (AI-off 계약). 분석이 꺼져 있으면 분석 상태를 폴링하지 않고, 그래프가 꺼져 있으면 그래프를 요청하지 않는다.
 * 받는 중이면 undefined (resolveCapabilities). App이 처음에 한 번 불러 두어 노트를 열 때 기다리지 않게 한다.
 */
export function useCapabilities() {
  const query = useQuery({
    queryKey: keys.capabilities,
    queryFn: ({ signal }) => getCapabilities(signal),
    staleTime: 30_000,
    retry: false,
  })
  return resolveCapabilities(query.data, query.isError, query.isFetching)
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
export function useNote(noteId: string, enabled = true) {
  return useQuery({
    queryKey: keys.note(noteId),
    queryFn: ({ signal }) => getNote(noteId, signal),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

/**
 * 노트의 가장 최근 분석 작업 (F-ANL-01). 대기·진행 중이거나, 저장한 version의 작업이 아직 안 보이는 동안 폴링한다.
 * 숨겨진 탭에서는 멈추고(refetchIntervalInBackground 기본값) 돌아오면 바로 다시 받는다(refetchOnWindowFocus).
 * 같은 노트에서 한 곳만 부른다 (부르는 곳마다 폴링 타이머가 따로 돈다).
 */
export function useNoteAnalysis(noteId: string, enabled = false) {
  const [nextPoll] = useState(() => createAnalysisPoller())
  // 편집기가 저장할 때마다 캐시의 version을 올린다 (useApplySavedNote).
  const savedVersion = useNote(noteId).data?.version
  return useQuery({
    queryKey: keys.noteAnalysis(noteId),
    enabled,
    queryFn: ({ signal }) => getNoteAnalysis(noteId, signal),
    refetchInterval: (query) =>
      // 노트가 지워졌으면 멈춘다
      !enabled ||
      isApiError(query.state.error, 'NOT_FOUND') ||
      isApiError(query.state.error, 'AI_UNAVAILABLE')
        ? false
        : nextPoll(query.state.data, savedVersion),
  })
}

/** 전체 그래프 (F-VIZ-01). 화면을 열 때와 창에 돌아올 때 다시 받는다. */
export function useGraph(enabled: boolean) {
  return useQuery({ queryKey: keys.graph, queryFn: ({ signal }) => getGraph(signal), enabled })
}

/** 저장한 뒤 이만큼 더 고치지 않으면 추천을 요청한다 (자동 저장마다 LLM을 돌리지 않게, docs PR #17) */
export const RECOMMEND_AFTER_SAVE_MS = 5000
/** 추천 작업 polling 간격 (FE 선호안: 작업 ID + polling) */
export const RECOMMEND_POLL_MS = 2000

/**
 * 노트의 가장 최근 추천 작업 (Figma W3-07~09). 이 화면에서 요청한 작업만 안다 (작업 id로만 조회할 수 있다).
 * 요청한 적이 없으면 null. pending이면 polling하고 completed면 멈춘다. 작업을 못 찾으면(보관 기간이 지남) null로 본다.
 */
export function useRecommendations(noteId: string | null) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: keys.recommendationJob(noteId ?? ''),
    queryFn: async ({ signal }): Promise<RecommendationJob | null> => {
      const job = qc.getQueryData<RecommendationJob | null>(keys.recommendationJob(noteId!))
      if (!job) return null
      try {
        return await getRecommendationJob(job.id, signal)
      } catch (e) {
        if (isApiError(e, 'NOT_FOUND')) return null
        throw e
      }
    },
    enabled: noteId !== null,
    staleTime: Infinity,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? RECOMMEND_POLL_MS : false,
  })
}

/**
 * 추천 카드에 남긴 답 (W3-10·11). 패널과 접힌 패널의 배지(W3-14b)가 함께 쓰도록 캐시에 둔다.
 * 답은 화면에 바로 반영하고 POST /recommendations/{id}/feedback으로 보낸다(BE에 아직 없어 가짜 서버만).
 * 보내지 못하면 답을 되돌리고(카드가 다시 보인다) 오류를 던진다. 새로 고치면 캐시는 사라진다.
 */
export function useRecommendationAnswers() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: keys.recommendationAnswers,
    queryFn: (): Record<string, RecommendationAnswer> => ({}),
    initialData: {},
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const answer = useCallback(
    async (recommendationId: string, action: RecommendationAnswer) => {
      const before = qc.getQueryData<Record<string, RecommendationAnswer>>(
        keys.recommendationAnswers,
      )?.[recommendationId]
      qc.setQueryData<Record<string, RecommendationAnswer>>(keys.recommendationAnswers, (prev) => ({
        ...prev,
        [recommendationId]: action,
      }))
      try {
        await sendRecommendationFeedback(recommendationId, action)
      } catch (e) {
        qc.setQueryData<Record<string, RecommendationAnswer>>(
          keys.recommendationAnswers,
          (prev) => {
            // 그 사이 다른 답을 골랐으면 그대로 둔다
            if (prev?.[recommendationId] !== action) return prev
            const next = { ...prev }
            if (before === undefined) delete next[recommendationId]
            else next[recommendationId] = before
            return next
          },
        )
        throw e
      }
    },
    [qc],
  )
  return { answers: data, answer }
}

/** 추천 작업을 바로 요청한다 (가져오기 트리거). 추천이 꺼져 있으면 보내지 않는다. */
export function useRequestRecommendations() {
  const qc = useQueryClient()
  return useCallback(
    async (noteId: string) => {
      if (qc.getQueryData<Capabilities>(keys.capabilities)?.discoveriesEnabled !== true) return
      try {
        const job = await requestRecommendationJob(noteId)
        qc.setQueryData(keys.recommendationJob(noteId), job)
      } catch {
        // 추천 실패는 알리지 않는다 (10/30: 실패 비노출). 다음 저장 때 다시 요청한다.
      }
    },
    [qc],
  )
}

const recommendTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * 저장 트리거: 저장할 때마다 부르면, 마지막 저장 뒤 RECOMMEND_AFTER_SAVE_MS 동안 더 저장하지 않을 때 한 번 요청한다.
 * 노트를 떠나도 예약은 남는다 (그 노트의 마지막 내용으로 요청).
 */
export function useScheduleRecommendations() {
  const requestNow = useRequestRecommendations()
  return useCallback(
    (noteId: string) => {
      clearTimeout(recommendTimers.get(noteId))
      recommendTimers.set(
        noteId,
        setTimeout(() => {
          recommendTimers.delete(noteId)
          void requestNow(noteId)
        }, RECOMMEND_AFTER_SAVE_MS),
      )
    },
    [requestNow],
  )
}

/**
 * 저장된 노트를 캐시에 반영한다. 사이드바 목록의 제목도 다시 불러오지 않고 바로 바꾼다.
 * 분석이 켜져 있고 폴링 중이 아니면 분석 상태를 한 번 다시 받는다. BE가 저장 때 작업을 만들었으면 거기서 폴링이 시작되고,
 * 아직 없으면 폴링이 새 작업을 기다린다 (createAnalysisPoller). AI-off면 받지 않는다.
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
      // 그래프의 근거 노트 제목. 그래프 화면이 닫혀 있으면 표시만 해 두고 열 때 받는다.
      void qc.invalidateQueries({ queryKey: keys.graph })
      const capabilities = qc.getQueryData<Capabilities>(keys.capabilities)
      const job = qc.getQueryData<AnalysisJob | null>(keys.noteAnalysis(note.id))
      if (capabilities?.analysisEnabled && !isAnalysisActive(job))
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

/** 주제(null이면 미분류)에 있는 노트 제목들. 캐시가 있어도 서버에서 새로 받는다 (가져올 때 번호 붙이기). */
export function useFetchTitlesIn() {
  const qc = useQueryClient()
  return useCallback(
    async (topicId: string | null) => {
      const notes = await qc.fetchQuery({
        queryKey: keys.notesIn(topicId),
        queryFn: ({ signal }) => listNotes({ topicId }, signal),
        staleTime: 0,
      })
      return new Set(notes.map((n) => n.title))
    },
    [qc],
  )
}

/**
 * 가져온 파일 하나로 노트를 만든다 (가져오기). 제목은 앱이 정한 그대로 보내고,
 * 겹치면 NOTE_TITLE_TAKEN을 그대로 돌려준다 (번호 붙이기는 가져오기 쪽이 한다).
 */
export function useImportNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NoteCreate) => createNote(input),
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
      // 근거 노트의 주제가 미분류로 바뀐다
      void qc.invalidateQueries({ queryKey: keys.graph })
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
      void qc.invalidateQueries({ queryKey: keys.graph })
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
      void qc.invalidateQueries({ queryKey: keys.graph })
      void qc.invalidateQueries({ queryKey: keys.noteLists })
      void qc.invalidateQueries({ queryKey: keys.topics })
    },
  })
}
