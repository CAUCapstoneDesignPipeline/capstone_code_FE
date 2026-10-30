import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useToast } from '../components/toastContext'
import { useCapabilities, useCreateUntitledNote } from '../data/queries'
import type { LeaveGuard } from '../features/editor/NoteEditor'
import { NotePane } from '../features/note/NotePane'
import { Sidebar } from '../features/sidebar/Sidebar'
import styles from './App.module.css'

// 그래프 화면은 Cytoscape가 커서(약 400KB) 열 때 따로 불러온다.
const GraphView = lazy(() =>
  import('../features/graph/GraphView').then((m) => ({ default: m.GraphView })),
)

/** 가운데 화면: 노트 편집기 또는 전체 그래프 */
type Target = { kind: 'note'; noteId: string } | { kind: 'graph' }

export function App() {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [graphOpen, setGraphOpen] = useState(false)
  /** 사이드바 트리에 새 주제 입력칸을 띄웠는지 (사이드바 아래 버튼·빈 화면 버튼 공통) */
  const [addingTopic, setAddingTopic] = useState(false)
  const createNote = useCreateUntitledNote()
  // AI 기능 여부를 처음에 받아 둔다. 노트를 열 때 패널이 이것을 기다리지 않게 한다.
  useCapabilities()
  const toast = useToast()
  const leaveGuard = useRef<LeaveGuard | null>(null)
  const registerLeaveGuard = useCallback((guard: LeaveGuard | null) => {
    leaveGuard.current = guard
  }, [])
  const clearSelection = useCallback(() => setSelectedNoteId(null), [])
  /** 저장 안 된 내용이 있어 확인을 기다리는 이동 */
  const [leaving, setLeaving] = useState<{ to: Target; reason: string } | null>(null)

  function show(target: Target) {
    if (target.kind === 'graph') {
      setGraphOpen(true)
    } else {
      setSelectedNoteId(target.noteId)
      setGraphOpen(false)
    }
  }

  /** 다른 노트나 그래프로 간다. 열린 노트에 저장 안 된 내용이 있으면 먼저 묻는다. */
  function go(target: Target) {
    const here = graphOpen ? 'graph' : selectedNoteId
    if ((target.kind === 'graph' ? 'graph' : target.noteId) === here) return
    const reason = leaveGuard.current?.() ?? null
    if (reason) setLeaving({ to: target, reason })
    else show(target)
  }

  const selectNote = (noteId: string) => go({ kind: 'note', noteId })

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
          graphOpen={graphOpen}
          onOpenGraph={() => go({ kind: 'graph' })}
          onSelectNote={selectNote}
          addingTopic={addingTopic}
          onAddingTopicChange={setAddingTopic}
          onCreateNote={createNoteIn}
          creatingNote={createNote.isPending}
        />
      </aside>
      <main className={styles.main}>
        {graphOpen ? (
          // 그래프 화면 파일을 못 받으면(오프라인, 새 배포로 옛 파일이 사라짐) 앱 전체 대신 이 자리만 알린다.
          <ErrorBoundary
            fallback={
              <div className={styles.notice} role="alert">
                <p>그래프 화면을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로 고침하세요.</p>
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  새로 고침
                </Button>
              </div>
            }
          >
            <Suspense fallback={<p className={styles.notice}>불러오는 중…</p>}>
              <GraphView onOpenNote={selectNote} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <NotePane
            noteId={selectedNoteId}
            registerLeaveGuard={registerLeaveGuard}
            onCreateNote={() => createNoteIn(null)}
            onCreateTopic={() => setAddingTopic(true)}
            onNoteGone={clearSelection}
          />
        )}
      </main>

      {leaving && (
        <ConfirmDialog
          title="저장되지 않은 내용이 있습니다"
          description={`${leaving.reason} ${leaving.to.kind === 'graph' ? '그래프로' : '다른 노트로'} 옮기면 이 노트에서 고친 내용이 사라집니다. 필요한 내용은 복사해 두세요.`}
          confirmLabel="버리고 이동"
          cancelLabel="계속 편집"
          onCancel={() => setLeaving(null)}
          onConfirm={() => {
            show(leaving.to)
            setLeaving(null)
          }}
        />
      )}
    </div>
  )
}
