import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toastContext'
import { useMoveNote, useNote, useTopics } from '../../data/queries'
import { moveNoteErrorMessage } from '../../lib/errorMessages'
import { withRo } from '../../lib/korean'
import { usePopover } from '../../lib/usePopover'
import styles from './NoteEditor.module.css'

/**
 * 빵부스러기 "주제 › 제목"의 주제 부분 (Figma DropdownTrigger + Dropdown).
 * 누르면 주제 선택 상자가 열리고, 고르면 바로 옮긴다. 현재 주제는 캐시에서 읽어 사이드바 끌어 놓기와도 맞춘다.
 */
export function TopicDropdown({ noteId }: { noteId: string }) {
  const note = useNote(noteId)
  const topics = useTopics()
  const move = useMoveNote()
  const toast = useToast()
  const { open, setOpen, rootRef, triggerRef } = usePopover<HTMLDivElement, HTMLButtonElement>()
  const current = note.data?.topicId ?? null
  const currentName =
    current === null ? '미분류' : (topics.data?.topics.find((t) => t.id === current)?.name ?? '')

  function choose(topicId: string | null, name: string) {
    setOpen(false)
    triggerRef.current?.focus()
    if (topicId === current) return
    move.mutate(
      { noteId, topicId },
      {
        onSuccess: () => toast('info', `노트를 ${withRo(name)} 옮겼습니다.`),
        onError: (e) => toast('error', moveNoteErrorMessage(e)),
      },
    )
  }

  function option(topicId: string | null, name: string) {
    const selected = topicId === current
    return (
      <li key={topicId ?? 'none'} role="none">
        <button
          type="button"
          role="option"
          aria-selected={selected}
          className={styles.option}
          onClick={() => choose(topicId, name)}
        >
          <Icon name={topicId === null ? 'unassigned' : 'topic'} />
          <span className={styles.optionLabel}>{name}</span>
          {selected && <Icon name="check" />}
        </button>
      </li>
    )
  }

  return (
    <div className={styles.dropdownRoot} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.dropdownTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`주제: ${currentName}. 다른 주제로 옮기기`}
        disabled={move.isPending || !topics.data}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={current === null ? 'unassigned' : 'topic'} />
        <span>{currentName}</span>
        <Icon name="chevron-down" />
      </button>
      {open && topics.data && (
        <div className={styles.dropdown}>
          <p className={styles.dropdownHeader}>주제로 옮기기</p>
          <ul role="listbox" aria-label="주제로 옮기기" className={styles.optionList}>
            {topics.data.topics.map((t) => option(t.id, t.name))}
            <li role="separator" className={styles.dropdownDivider} />
            {option(null, '미분류')}
          </ul>
        </div>
      )}
    </div>
  )
}
