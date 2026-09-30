import { isApiError } from '../../api'
import { useNote } from '../../data/queries'
import { NoteEditor, type LeaveGuard } from '../editor/NoteEditor'
import styles from './NotePane.module.css'

interface Props {
  noteId: string | null
  registerLeaveGuard?: (guard: LeaveGuard | null) => void
}

export function NotePane({ noteId, registerLeaveGuard }: Props) {
  if (!noteId)
    return <div className={styles.empty}>왼쪽에서 노트를 고르거나 새 노트를 만드세요.</div>
  return <LoadedNote key={noteId} noteId={noteId} registerLeaveGuard={registerLeaveGuard} />
}

function LoadedNote({
  noteId,
  registerLeaveGuard,
}: { noteId: string } & Pick<Props, 'registerLeaveGuard'>) {
  const note = useNote(noteId)

  // 한 번 불러온 뒤에는 이후 오류가 나도 편집기를 유지한다 (편집 중인 내용을 지우지 않는다).
  if (note.data) return <NoteEditor note={note.data} registerLeaveGuard={registerLeaveGuard} />
  if (note.isError) {
    const message = isApiError(note.error, 'NOT_FOUND') ? '없는 노트입니다.' : note.error.message
    return <div className={`${styles.empty} ${styles.error}`}>{message}</div>
  }
  return <div className={styles.empty}>불러오는 중…</div>
}
