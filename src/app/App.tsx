import { useCallback, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useToast } from '../components/toastContext'
import { useCreateUntitledNote } from '../data/queries'
import type { LeaveGuard } from '../features/editor/NoteEditor'
import { NotePane } from '../features/note/NotePane'
import { Sidebar } from '../features/sidebar/Sidebar'
import styles from './App.module.css'

export function App() {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  /** 사이드바 트리에 새 주제 입력칸을 띄웠는지 (사이드바 아래 버튼·빈 화면 버튼 공통) */
  const [addingTopic, setAddingTopic] = useState(false)
  const createNote = useCreateUntitledNote()
  const toast = useToast()
  const leaveGuard = useRef<LeaveGuard | null>(null)
  const registerLeaveGuard = useCallback((guard: LeaveGuard | null) => {
    leaveGuard.current = guard
  }, [])
  const clearSelection = useCallback(() => setSelectedNoteId(null), [])
  /** 저장 안 된 내용이 있어 확인을 기다리는 이동 */
  const [leaving, setLeaving] = useState<{ to: string; reason: string } | null>(null)

  function selectNote(noteId: string) {
    if (noteId === selectedNoteId) return
    const reason = leaveGuard.current?.() ?? null
    if (reason) setLeaving({ to: noteId, reason })
    else setSelectedNoteId(noteId)
  }

  /** 새 노트는 겹치지 않는 기본 제목("제목 없음", "제목 없음 1", …)으로 만들고 바로 연다. topicId가 null이면 미분류 */
  function createNoteIn(topicId: string | null) {
    createNote.mutate(topicId, {
      onSuccess: (note) => selectNote(note.id),
      onError: (e) => toast('error', `노트를 만들지 못했습니다. ${e.message}`),
    })
  }

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <Sidebar
          selectedNoteId={selectedNoteId}
          onSelectNote={selectNote}
          addingTopic={addingTopic}
          onAddingTopicChange={setAddingTopic}
          onCreateNote={createNoteIn}
          creatingNote={createNote.isPending}
        />
      </aside>
      <main className={styles.main}>
        <NotePane
          noteId={selectedNoteId}
          registerLeaveGuard={registerLeaveGuard}
          onCreateNote={() => createNoteIn(null)}
          onCreateTopic={() => setAddingTopic(true)}
          onNoteGone={clearSelection}
        />
      </main>

      {leaving && (
        <ConfirmDialog
          title="저장되지 않은 내용이 있습니다"
          description={`${leaving.reason} 다른 노트로 옮기면 이 노트에서 고친 내용이 사라집니다. 필요한 내용은 복사해 두세요.`}
          confirmLabel="버리고 이동"
          cancelLabel="계속 편집"
          onCancel={() => setLeaving(null)}
          onConfirm={() => {
            setSelectedNoteId(leaving.to)
            setLeaving(null)
          }}
        />
      )}
    </div>
  )
}
