import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useToast } from '../components/toastContext'
import { useCapabilities, useCreateUntitledNote } from '../data/queries'
import type { LeaveGuard } from '../features/editor/NoteEditor'
import { NotePane } from '../features/note/NotePane'
import { RecommendPanel } from '../features/recommend/RecommendPanel'
import { Sidebar } from '../features/sidebar/Sidebar'
import styles from './App.module.css'

// 그래프 화면은 Cytoscape가 커서(약 400KB) 열 때 따로 불러온다.
const GraphView = lazy(() =>
  import('../features/graph/GraphView').then((m) => ({ default: m.GraphView })),
)

/** 가운데 화면: 노트 편집기 또는 전체 그래프 */
type Target = { kind: 'note'; noteId: string } | { kind: 'graph' }

/** 접을 수 있는 양옆 칸: 왼쪽 사이드바, 오른쪽 추천·챗봇 패널 */
type Side = 'sidebar' | 'panel'

const COLLAPSED_STORAGE_KEYS: Record<Side, string> = {
  sidebar: 'capstone.sidebar.collapsed',
  panel: 'capstone.panel.collapsed',
}

/** 이 브라우저에서 마지막으로 접어 두었는지. 저장소를 쓸 수 없으면(사생활 보호 창 등) 펼친다. */
function readCollapsed(side: Side): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEYS[side]) === 'true'
  } catch {
    return false
  }
}

export function App() {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [graphOpen, setGraphOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<Side, boolean>>(() => ({
    sidebar: readCollapsed('sidebar'),
    panel: readCollapsed('panel'),
  }))
  // 접기·펴기 버튼. 누른 버튼이 사라지면 반대쪽 버튼으로 초점을 옮긴다.
  const collapseSidebarRef = useRef<HTMLButtonElement>(null)
  const expandSidebarRef = useRef<HTMLButtonElement>(null)
  const collapsePanelRef = useRef<HTMLButtonElement>(null)
  const expandPanelRef = useRef<HTMLButtonElement>(null)
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

  /** 사이드바나 오른쪽 패널을 접거나 편다. 누른 버튼이 사라지므로 초점을 반대쪽 버튼으로 옮긴다. */
  function setSideCollapsed(side: Side, value: boolean) {
    flushSync(() => setCollapsed((prev) => ({ ...prev, [side]: value })))
    const focusTarget =
      side === 'sidebar'
        ? value
          ? expandSidebarRef
          : collapseSidebarRef
        : value
          ? expandPanelRef
          : collapsePanelRef
    focusTarget.current?.focus()
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEYS[side], String(value))
    } catch {
      // 저장하지 못해도 이번 화면에서는 그대로 둔다
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
    <div
      className={[
        styles.app,
        collapsed.sidebar && styles.sidebarCollapsed,
        collapsed.panel && styles.panelCollapsed,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* 접어도 내리지 않고 숨긴다. 검색어·펼친 주제가 그대로 남는다. */}
      <aside className={styles.sidebar} hidden={collapsed.sidebar}>
        <Sidebar
          selectedNoteId={selectedNoteId}
          graphOpen={graphOpen}
          onOpenGraph={() => go({ kind: 'graph' })}
          onSelectNote={selectNote}
          addingTopic={addingTopic}
          onAddingTopicChange={setAddingTopic}
          onCreateNote={createNoteIn}
          creatingNote={createNote.isPending}
          onCollapse={() => setSideCollapsed('sidebar', true)}
          collapseRef={collapseSidebarRef}
        />
      </aside>
      <main className={styles.main}>
        {collapsed.sidebar && (
          <IconButton
            ref={expandSidebarRef}
            icon="panel-left-open"
            label="사이드바 펼치기"
            className={`${styles.expandButton} ${styles.expandSidebar}`}
            onClick={() => setSideCollapsed('sidebar', false)}
          />
        )}
        {collapsed.panel && (
          <IconButton
            ref={expandPanelRef}
            icon="panel-right-open"
            label="패널 펼치기"
            className={`${styles.expandButton} ${styles.expandPanel}`}
            onClick={() => setSideCollapsed('panel', false)}
          />
        )}
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
      {/* 노트를 열지 않았거나 그래프를 볼 때도 늘 보인다 */}
      <div className={styles.panel} hidden={collapsed.panel}>
        <RecommendPanel
          onCollapse={() => setSideCollapsed('panel', true)}
          collapseRef={collapsePanelRef}
        />
      </div>

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
