import { useMemo, useState } from 'react'
import type { Topic } from '../../api'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toastContext'
import {
  useCreateTopic,
  useMoveNote,
  useNoteTopicId,
  useSwapTopicOrder,
  useTopics,
} from '../../data/queries'
import { moveNoteErrorMessage } from '../../lib/errorMessages'
import { withRo } from '../../lib/korean'
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
  /** 트리에 새 주제 입력칸을 띄웠는지 (빈 화면의 "새 주제" 버튼과 공유) */
  addingTopic: boolean
  onAddingTopicChange: (adding: boolean) => void
  /** 새 노트를 만든다. null이면 미분류 */
  onCreateNote: (topicId: string | null) => void
  creatingNote: boolean
}

/** 펼침 상태를 기억할 때 쓰는 키. 미분류는 'none' */
const nodeKey = (topicId: string | null) => topicId ?? 'none'

const SEARCH_MAX = 100
const SEARCH_DELAY_MS = 300

/** Figma W1-05 Sidebar: 머리 · 검색 · "주제" · 트리 · 미분류 · (아래) 새 주제 · 새 노트 */
export function Sidebar(props: Props) {
  const { selectedNoteId, onSelectNote, addingTopic, onAddingTopicChange } = props
  const topics = useTopics()
  const createTopic = useCreateTopic()
  const swapOrder = useSwapTopicOrder()
  const moveNote = useMoveNote()
  const toast = useToast()
  const selectedTopicId = useNoteTopicId(selectedNoteId)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null)
  const [query, setQuery] = useState('')
  const q = normalizeName(useDebouncedValue(query, SEARCH_DELAY_MS))
  const searching = query.trim() !== ''

  const topicNames = useMemo(
    () => new Map(topics.data?.topics.map((t) => [t.id, t.name])),
    [topics.data],
  )

  // 열린 노트가 들어 있는 주제는 펼쳐서 보여준다 (새 노트, 이동, 검색 결과에서 열었을 때).
  // 주제가 바뀐 순간에만 펼친다. 사용자가 다시 접으면 그대로 둔다.
  const [revealedTopicId, setRevealedTopicId] = useState<string | null | undefined>(undefined)
  if (selectedTopicId !== undefined && selectedTopicId !== revealedTopicId) {
    setRevealedTopicId(selectedTopicId)
    const key = nodeKey(selectedTopicId)
    if (!expanded.has(key)) setExpanded(new Set(expanded).add(key))
  }

  function toggle(topicId: string | null) {
    setExpanded((prev) => {
      const next = new Set(prev)
      const key = nodeKey(topicId)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleDropNote(topicId: string | null, drag: NoteDrag) {
    if (drag.fromTopicId === topicId) return
    const name = topicId === null ? '미분류' : (topicNames.get(topicId) ?? '')
    moveNote.mutate(
      { noteId: drag.noteId, topicId },
      {
        onSuccess: () => {
          setExpanded((prev) => new Set(prev).add(nodeKey(topicId)))
          toast('info', `노트를 ${withRo(name)} 옮겼습니다.`)
        },
        onError: (e) => toast('error', moveNoteErrorMessage(e)),
      },
    )
  }

  function renderNode(topic: Topic | null, index: number, list: Topic[]) {
    const topicId = topic?.id ?? null
    // 앞선 순서 바꾸기가 끝나기 전에는 막는다 (PATCH 두 번이 겹치지 않게).
    const canMove = topic !== null && !swapOrder.isPending
    const move = (direction: 'up' | 'down') => {
      const neighbor = list[direction === 'up' ? index - 1 : index + 1]
      if (!topic || !neighbor) return
      swapOrder.mutate(
        { topic, neighbor, direction },
        { onError: (e) => toast('error', `순서를 바꾸지 못했습니다. ${e.message}`) },
      )
    }
    return (
      <TopicNode
        key={nodeKey(topicId)}
        topic={topic}
        label={topic?.name ?? '미분류'}
        count={topic?.noteCount ?? topics.data?.unassignedNoteCount ?? 0}
        expanded={expanded.has(nodeKey(topicId))}
        onToggle={() => toggle(topicId)}
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
      <div className={styles.header}>CAPSTONE</div>

      <label className={styles.field}>
        <Icon name="search" className={styles.muted} />
        <input
          type="search"
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
          placeholder="검색"
          aria-label="노트 검색 (제목·본문)"
          maxLength={SEARCH_MAX}
        />
      </label>

      <div className={styles.scroll}>
        {searching ? (
          <SearchResults
            q={q}
            topicNames={topicNames}
            selectedNoteId={selectedNoteId}
            onSelectNote={onSelectNote}
          />
        ) : (
          <>
            <h2 className={styles.sectionLabel}>주제</h2>
            {topics.isPending && <p className={styles.hint}>불러오는 중…</p>}
            {topics.isError && (
              <div className={styles.loadError} role="alert">
                <p className={styles.hint}>주제를 불러오지 못했습니다. {topics.error.message}</p>
                <Button variant="secondary" onClick={() => topics.refetch()}>
                  다시 시도
                </Button>
              </div>
            )}
            {topics.isSuccess && (
              <>
                <ul className={styles.list}>
                  {topics.data.topics.length === 0 && !addingTopic && (
                    <li className={styles.hint}>아직 주제가 없습니다</li>
                  )}
                  {topics.data.topics.map((t, i, list) => renderNode(t, i, list))}
                  {addingTopic && (
                    <li>
                      <TopicNameForm
                        icon="topic"
                        placeholder="새 주제 이름"
                        hint="Enter로 만들기 · Esc로 취소"
                        onSubmit={(name) => createTopic.mutateAsync({ name })}
                        onDone={() => onAddingTopicChange(false)}
                      />
                    </li>
                  )}
                </ul>
                <ul className={styles.list}>{renderNode(null, -1, [])}</ul>
              </>
            )}
          </>
        )}
      </div>

      <div className={styles.actions}>
        <Button
          variant="secondary"
          icon="plus"
          onClick={() => {
            setQuery('')
            onAddingTopicChange(true)
          }}
        >
          새 주제
        </Button>
        <Button
          variant="secondary"
          icon="plus"
          disabled={props.creatingNote}
          // 열린 노트의 주제에 만든다. 열린 노트가 없으면 미분류 (W1-01 안내 문구)
          onClick={() => {
            setQuery('')
            props.onCreateNote(selectedTopicId ?? null)
          }}
        >
          새 노트
        </Button>
      </div>

      {deletingTopic && (
        <DeleteTopicDialog topic={deletingTopic} onClose={() => setDeletingTopic(null)} />
      )}
    </nav>
  )
}
