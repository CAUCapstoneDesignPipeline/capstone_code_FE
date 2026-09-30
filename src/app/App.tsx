import { useCallback, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { LeaveGuard } from '../features/editor/NoteEditor'
import { NotePane } from '../features/note/NotePane'
import { Sidebar } from '../features/sidebar/Sidebar'
import styles from './App.module.css'

export function App() {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const leaveGuard = useRef<LeaveGuard | null>(null)
  const registerLeaveGuard = useCallback((guard: LeaveGuard | null) => {
    leaveGuard.current = guard
  }, [])
  /** 저장 안 된 내용이 있어 확인을 기다리는 이동 */
  const [leaving, setLeaving] = useState<{ to: string; reason: string } | null>(null)

  function selectNote(noteId: string) {
    if (noteId === selectedNoteId) return
    const reason = leaveGuard.current?.() ?? null
    if (reason) setLeaving({ to: noteId, reason })
    else setSelectedNoteId(noteId)
  }

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <Sidebar selectedNoteId={selectedNoteId} onSelectNote={selectNote} />
      </aside>
      <main className={styles.main}>
        <NotePane noteId={selectedNoteId} registerLeaveGuard={registerLeaveGuard} />
      </main>

      {leaving && (
        <ConfirmDialog
          title="저장되지 않은 내용이 있습니다"
          confirmLabel="버리고 이동"
          cancelLabel="계속 편집"
          danger
          onCancel={() => setLeaving(null)}
          onConfirm={() => {
            setSelectedNoteId(leaving.to)
            setLeaving(null)
          }}
        >
          <p>{leaving.reason}</p>
          <p>다른 노트로 옮기면 이 노트에서 고친 내용이 사라집니다. 필요한 내용은 복사해 두세요.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
