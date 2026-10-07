import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { isApiError } from '../../api'
import { Button } from '../../components/Button'
import { useToast } from '../../components/toastContext'
import { keys, useNote } from '../../data/queries'
import { NoteEditor, type LeaveGuard } from '../editor/NoteEditor'
import styles from './NotePane.module.css'

interface Props {
  noteId: string | null
  registerLeaveGuard?: (guard: LeaveGuard | null) => void
  onCreateNote: () => void
  onCreateTopic: () => void
  /** 연 노트가 없어졌을 때 (다른 곳에서 삭제됨, 이 화면에서 삭제함) */
  onNoteGone: () => void
}

export function NotePane({ noteId, ...props }: Props) {
  if (!noteId) {
    // Figma W1-01 Editor/Empty
    return (
      <div className={styles.pane}>
        <div className={styles.topBar} />
        <div className={styles.empty}>
          <h1 className={styles.emptyTitle}>열린 노트가 없습니다</h1>
          <p className={styles.emptyText}>
            왼쪽에서 노트를 고르거나 새 노트를 만드세요. 주제 없이 만든 노트는 미분류에 들어갑니다.
          </p>
          <div className={styles.emptyActions}>
            <Button icon="plus" onClick={props.onCreateNote}>
              새 노트
            </Button>
            <Button variant="ghost" icon="plus" onClick={props.onCreateTopic}>
              새 주제
            </Button>
          </div>
        </div>
      </div>
    )
  }
  return <LoadedNote key={noteId} noteId={noteId} {...props} />
}

function LoadedNote({
  noteId,
  registerLeaveGuard,
  onNoteGone,
}: { noteId: string } & Omit<Props, 'noteId'>) {
  const note = useNote(noteId)
  const qc = useQueryClient()
  const toast = useToast()
  const missing = !note.data && isApiError(note.error, 'NOT_FOUND')

  // W1-21: 열려던 노트가 없으면 알리고 트리를 새로 고친다.
  useEffect(() => {
    if (!missing) return
    toast('error', '삭제된 노트입니다')
    void qc.invalidateQueries({ queryKey: keys.noteLists })
    void qc.invalidateQueries({ queryKey: keys.topics })
    onNoteGone()
  }, [missing, toast, qc, onNoteGone])

  // 한 번 불러온 뒤에는 이후 오류가 나도 편집기를 유지한다 (편집 중인 내용을 지우지 않는다).
  if (note.data) {
    return (
      <NoteEditor note={note.data} registerLeaveGuard={registerLeaveGuard} onDeleted={onNoteGone} />
    )
  }
  return (
    <div className={styles.pane}>
      <div className={styles.topBar} />
      <div className={styles.empty}>
        {note.isError && !missing ? (
          <p className={styles.emptyText} role="alert">
            {note.error.message}
          </p>
        ) : (
          <p className={styles.emptyText}>불러오는 중…</p>
        )}
      </div>
    </div>
  )
}
