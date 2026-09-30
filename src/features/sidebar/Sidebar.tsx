import { useMemo, useState } from 'react'
import type { Topic } from '../../api'
import {
  useCreateTopic,
  useCreateUntitledNote,
  useMoveNote,
  useSwapTopicOrder,
  useTopics,
} from '../../data/queries'
import { moveNoteErrorMessage } from '../../lib/errorMessages'
import { normalizeName } from '../../lib/names'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { DeleteTopicDialog } from './DeleteTopicDialog'
import type { NoteDrag } from './noteDrag'
import { SearchResults } from './SearchResults'
import styles from './Sidebar.module.css'
import { TopicNameForm } from './TopicNameForm'
import { TopicNode } from './TopicNode'

interface Props {
  selectedNoteId: string | null
  onSelectNote: (noteId: string) => void
}

/** 펼침 상태를 기억할 때 쓰는 키. 미분류는 'none' */
const nodeKey = (topicId: string | null) => topicId ?? 'none'

const SEARCH_MAX = 100
const SEARCH_DELAY_MS = 300

export function Sidebar({ selectedNoteId, onSelectNote }: Props) {
  const topics = useTopics()
  const createTopic = useCreateTopic()
  const createNote = useCreateUntitledNote()
  const swapOrder = useSwapTopicOrder()
  const moveNote = useMoveNote()
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [addingTopic, setAddingTopic] = useState(false)
  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null)
  const [query, setQuery] = useState('')
  const q = normalizeName(useDebouncedValue(query, SEARCH_DELAY_MS))
  const searching = query.trim() !== ''

  const topicNames = useMemo(
    () => new Map(topics.data?.topics.map((t) => [t.id, t.name])),
    [topics.data],
  )

  function toggle(topicId: string | null) {
    setExpanded((prev) => {
      const next = new Set(prev)
      const key = nodeKey(topicId)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleCreateNote(topicId: string | null) {
    createNote.mutate(topicId, {
      onSuccess: (note) => {
        setQuery('')
        setExpanded((prev) => new Set(prev).add(nodeKey(topicId)))
        onSelectNote(note.id)
      },
    })
  }

  function handleDropNote(topicId: string | null, drag: NoteDrag) {
    if (drag.fromTopicId === topicId) return
    moveNote.mutate(
      { noteId: drag.noteId, topicId },
      { onSuccess: () => setExpanded((prev) => new Set(prev).add(nodeKey(topicId))) },
    )
  }

  function renderNode(topic: Topic | null, index: number, list: Topic[]) {
    const topicId = topic?.id ?? null
    // 앞선 순서 바꾸기가 끝나기 전에는 막는다 (PATCH 두 번이 겹치지 않게).
    const canMove = topic !== null && !swapOrder.isPending
    const move = (direction: 'up' | 'down') => {
      const neighbor = list[direction === 'up' ? index - 1 : index + 1]
      if (topic && neighbor) swapOrder.mutate({ topic, neighbor, direction })
    }
    return (
      <TopicNode
        key={nodeKey(topicId)}
        topic={topic}
        label={topic?.name ?? '미분류'}
        count={topic?.noteCount ?? topics.data?.unassignedNoteCount ?? 0}
        expanded={expanded.has(nodeKey(topicId))}
        onToggle={() => toggle(topicId)}
        onCreateNote={() => handleCreateNote(topicId)}
        creatingNote={createNote.isPending && createNote.variables === topicId}
        onMoveUp={canMove && index > 0 ? () => move('up') : undefined}
        onMoveDown={canMove && index < list.length - 1 ? () => move('down') : undefined}
        onDelete={topic ? () => setDeletingTopic(topic) : undefined}
        onDropNote={(drag) => handleDropNote(topicId, drag)}
        selectedNoteId={selectedNoteId}
        onSelectNote={onSelectNote}
      />
    )
  }

  return (
    <nav className={styles.sidebar} aria-label="주제와 노트">
      <div className={styles.search}>
        <input
          type="search"
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
          placeholder="제목·본문 검색"
          aria-label="노트 검색"
          maxLength={SEARCH_MAX}
        />
      </div>

      {createNote.isError && (
        <p className={styles.alert} role="alert">
          노트를 만들지 못했습니다. {createNote.error.message}
        </p>
      )}
      {moveNote.isError && (
        <div className={styles.alert} role="alert">
          <p>{moveNoteErrorMessage(moveNote.error)}</p>
          <button type="button" className={styles.alertClose} onClick={() => moveNote.reset()}>
            닫기
          </button>
        </div>
      )}
      {swapOrder.isError && (
        <p className={styles.alert} role="alert">
          순서를 바꾸지 못했습니다. {swapOrder.error.message}
        </p>
      )}

      {searching ? (
        <SearchResults
          q={q}
          topicNames={topicNames}
          selectedNoteId={selectedNoteId}
          onSelectNote={onSelectNote}
        />
      ) : (
        <>
          <div className={styles.header}>
            <h2 className={styles.heading}>주제</h2>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setAddingTopic(true)}
            >
              + 새 주제
            </button>
          </div>

          {addingTopic && (
            <TopicNameForm
              className={styles.newTopic}
              placeholder="새 주제 이름 (Enter로 만들기)"
              onSubmit={(name) => createTopic.mutateAsync({ name })}
              onDone={() => setAddingTopic(false)}
            />
          )}

          {topics.isPending && <p className={styles.status}>불러오는 중…</p>}
          {topics.isError && (
            <div className={styles.error} role="alert">
              <p>주제를 불러오지 못했습니다. {topics.error.message}</p>
              <button type="button" className={styles.textButton} onClick={() => topics.refetch()}>
                다시 시도
              </button>
            </div>
          )}
          {topics.isSuccess && (
            <ul className={styles.tree}>
              {topics.data.topics.map((t, i, list) => renderNode(t, i, list))}
              {renderNode(null, -1, [])}
            </ul>
          )}
        </>
      )}

      {deletingTopic && (
        <DeleteTopicDialog topic={deletingTopic} onClose={() => setDeletingTopic(null)} />
      )}
    </nav>
  )
}
