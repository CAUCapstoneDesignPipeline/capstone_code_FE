import { useCallback, useState } from 'react'
import type { Topic } from '../../api'
import { CountBadge } from '../../components/Badge'
import { ContextMenu } from '../../components/ContextMenu'
import { Icon } from '../../components/Icon'
import { useNotesIn, useRenameTopic } from '../../data/queries'
import { hasNoteDrag, readNoteDrag, setNoteDrag, type NoteDrag } from './noteDrag'
import styles from './Sidebar.module.css'
import { TopicNameForm } from './TopicNameForm'

interface Props {
  /** null이면 미분류 (메뉴 없음) */
  topic: Topic | null
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  /** 위·아래로 옮길 수 없으면 undefined */
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDelete?: () => void
  /** 노트를 이 주제에 놓았을 때 */
  onDropNote: (drag: NoteDrag) => void
  selectedNoteId: string | null
  onSelectNote: (noteId: string) => void
}

/**
 * Figma TreeItem: topic(화살표 + 주제 아이콘 + 이름 + 노트 수), unassigned-group(미분류).
 * 주제 메뉴는 우클릭(또는 키보드 메뉴 키)으로 연다 (W1-04). 메뉴가 열린 줄은 selected.
 */
export function TopicNode(props: Props) {
  const { topic, label, count, expanded, onToggle } = props
  const [renaming, setRenaming] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const rename = useRenameTopic()

  return (
    <li
      className={dropActive ? styles.dropTarget : undefined}
      onDragOver={(e) => {
        if (!hasNoteDrag(e.dataTransfer)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!dropActive) setDropActive(true)
      }}
      onDragLeave={(e) => {
        // 안쪽 요소로 옮겨 갈 때도 dragleave가 오므로 바깥으로 나갔을 때만 끈다.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropActive(false)
      }}
      onDrop={(e) => {
        setDropActive(false)
        const drag = readNoteDrag(e.dataTransfer)
        if (!drag) return
        e.preventDefault()
        props.onDropNote(drag)
      }}
    >
      {renaming && topic ? (
        <TopicNameForm
          className={styles.renameForm}
          icon="topic"
          initialName={topic.name}
          placeholder="주제 이름"
          hint="Enter로 저장 · Esc로 취소"
          onSubmit={(name) => rename.mutateAsync({ topicId: topic.id, name })}
          onDone={() => setRenaming(false)}
        />
      ) : (
        <button
          type="button"
          className={menu ? `${styles.item} ${styles.selected}` : styles.item}
          aria-expanded={expanded}
          aria-haspopup={topic ? 'menu' : undefined}
          onClick={onToggle}
          onContextMenu={(e) => {
            if (!topic) return
            e.preventDefault()
            // 키보드 메뉴 키로 열면 좌표가 0이라 줄 아래에 띄운다.
            const rect = e.currentTarget.getBoundingClientRect()
            const fromKeyboard = e.clientX === 0 && e.clientY === 0
            setMenu(
              fromKeyboard ? { x: rect.left + 24, y: rect.bottom } : { x: e.clientX, y: e.clientY },
            )
          }}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} />
          <Icon name={topic ? 'topic' : 'unassigned'} />
          <span className={styles.label}>{label}</span>
          <CountBadge count={count} />
        </button>
      )}
      {menu && topic && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={`${label} 메뉴`}
          onClose={closeMenu}
          items={[
            { label: '이름 변경', icon: 'pencil', onSelect: () => setRenaming(true) },
            {
              label: '위로 이동',
              icon: 'arrow-up',
              onSelect: () => props.onMoveUp?.(),
              disabled: !props.onMoveUp,
            },
            {
              label: '아래로 이동',
              icon: 'arrow-down',
              onSelect: () => props.onMoveDown?.(),
              disabled: !props.onMoveDown,
            },
            {
              label: '삭제',
              icon: 'trash',
              onSelect: () => props.onDelete?.(),
              dividerBefore: true,
            },
          ]}
        />
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

/** Figma TreeItem Kind=note: 24px 들여쓰기 + 노트 아이콘 */
function NoteList({ topicId, selectedNoteId, onSelectNote }: NoteListProps) {
  const notes = useNotesIn(topicId)

  if (notes.isPending) return <p className={styles.notesStatus}>불러오는 중…</p>
  if (notes.isError) return <p className={styles.notesStatus}>{notes.error.message}</p>
  if (notes.data.length === 0) return <p className={styles.notesStatus}>노트 없음</p>

  return (
    <ul className={styles.list}>
      {notes.data.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            className={styles.note}
            aria-current={n.id === selectedNoteId}
            onClick={() => onSelectNote(n.id)}
            title={n.title}
            draggable
            onDragStart={(e) => {
              setNoteDrag(e.dataTransfer, { noteId: n.id, fromTopicId: topicId })
              e.dataTransfer.effectAllowed = 'move'
            }}
          >
            <Icon name="note" />
            <span className={styles.label}>{n.title}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
