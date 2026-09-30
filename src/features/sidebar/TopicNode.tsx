import { useState } from 'react'
import type { Topic } from '../../api'
import { useNotesIn, useRenameTopic } from '../../data/queries'
import styles from './Sidebar.module.css'
import { TopicMenu } from './TopicMenu'
import { TopicNameForm } from './TopicNameForm'

interface Props {
  /** null이면 미분류 (메뉴 없음) */
  topic: Topic | null
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  onCreateNote: () => void
  creatingNote: boolean
  /** 위·아래로 옮길 수 없으면 undefined */
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDelete?: () => void
  selectedNoteId: string | null
  onSelectNote: (noteId: string) => void
}

export function TopicNode(props: Props) {
  const { topic, label, count, expanded, onToggle, onCreateNote, creatingNote } = props
  const [renaming, setRenaming] = useState(false)
  const rename = useRenameTopic()
  const className = [expanded && styles.expanded, topic === null && styles.unassigned]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={className}>
      {renaming && topic ? (
        <TopicNameForm
          className={styles.renameForm}
          initialName={topic.name}
          placeholder="주제 이름"
          onSubmit={(name) => rename.mutateAsync({ topicId: topic.id, name })}
          onDone={() => setRenaming(false)}
        />
      ) : (
        <div className={styles.row}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            onClick={onToggle}
          >
            <span className={styles.chevron} aria-hidden>
              ▶
            </span>
            <span className={styles.name}>{label}</span>
            <span className={styles.count}>{count}</span>
          </button>
          {topic && (
            <TopicMenu
              label={label}
              items={[
                { label: '이름 바꾸기', onSelect: () => setRenaming(true) },
                { label: '위로', onSelect: () => props.onMoveUp?.(), disabled: !props.onMoveUp },
                {
                  label: '아래로',
                  onSelect: () => props.onMoveDown?.(),
                  disabled: !props.onMoveDown,
                },
                { label: '삭제…', onSelect: () => props.onDelete?.(), danger: true },
              ]}
            />
          )}
          <button
            type="button"
            className={styles.rowButton}
            onClick={onCreateNote}
            disabled={creatingNote}
            title={`${label}에 새 노트`}
            aria-label={`${label}에 새 노트`}
          >
            +
          </button>
        </div>
      )}
      {expanded && (
        <NoteList
          topicId={topic?.id ?? null}
          selectedNoteId={props.selectedNoteId}
          onSelectNote={props.onSelectNote}
        />
      )}
    </li>
  )
}

interface NoteListProps {
  topicId: string | null
  selectedNoteId: string | null
  onSelectNote: (noteId: string) => void
}

function NoteList({ topicId, selectedNoteId, onSelectNote }: NoteListProps) {
  const notes = useNotesIn(topicId)

  if (notes.isPending) return <p className={styles.notesStatus}>불러오는 중…</p>
  if (notes.isError) return <p className={styles.notesStatus}>{notes.error.message}</p>
  if (notes.data.length === 0) return <p className={styles.notesStatus}>노트 없음</p>

  return (
    <ul className={styles.notes}>
      {notes.data.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            className={styles.note}
            aria-current={n.id === selectedNoteId}
            onClick={() => onSelectNote(n.id)}
            title={n.title}
          >
            {n.title}
          </button>
        </li>
      ))}
    </ul>
  )
}
