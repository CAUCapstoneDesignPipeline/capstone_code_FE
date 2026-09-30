import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getNote, updateNote, type Note } from '../../api'
import { Banner } from '../../components/Banner'
import { Button, IconButton } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ContextMenu } from '../../components/ContextMenu'
import { FieldError } from '../../components/FieldError'
import { useToast } from '../../components/toastContext'
import { useApplySavedNote, useDeleteNote, useNote } from '../../data/queries'
import styles from './NoteEditor.module.css'
import { NoteSaver, type SaveStatus } from './noteSaver'
import { SaveStatusIndicator } from './SaveStatusIndicator'
import { TopicDropdown } from './TopicDropdown'

/** 떠나기 전에 부른다. 떠나면 사라질 내용이 있으면 그 이유, 없으면 null */
export type LeaveGuard = () => string | null

const STUCK_REASON: Partial<Record<SaveStatus, string>> = {
  invalid: '제목 문제로 저장이 멈춰 있습니다.',
  error: '저장에 실패했습니다.',
  conflict: '다른 곳에서 먼저 수정되어 저장이 멈춰 있습니다.',
  deleted: '다른 곳에서 삭제된 노트입니다.',
}

interface Props {
  /** 편집을 시작할 때의 노트. 이후 바뀌어도 반영하지 않는다 (노트가 바뀌면 key로 새로 만든다). */
  note: Note
  /** 떠나기 전 확인 함수를 등록한다. 편집기가 사라지면 null로 부른다. */
  registerLeaveGuard?: (guard: LeaveGuard | null) => void
  /** 이 화면에서 노트를 삭제했을 때 */
  onDeleted: () => void
}

export function NoteEditor({ note, registerLeaveGuard, onDeleted }: Props) {
  const applySavedNote = useApplySavedNote()
  const [saver] = useState(() => new NoteSaver(note, { save: updateNote, onSaved: applySavedNote }))
  const state = useSyncExternalStore(saver.subscribe, saver.getState)
  // 빵부스러기는 마지막으로 저장된 제목을 보여준다 (W1-09).
  const savedTitle = useNote(note.id).data?.title ?? note.title
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const remove = useDeleteNote()
  const toast = useToast()

  // 노트를 떠날 때 남은 입력을 바로 저장한다.
  useEffect(() => () => saver.flush(), [saver])

  useEffect(() => {
    registerLeaveGuard?.(() =>
      saver.hasStuckChanges() ? (STUCK_REASON[saver.getState().status] ?? null) : null,
    )
    return () => registerLeaveGuard?.(null)
  }, [saver, registerLeaveGuard])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saver.flush()
      }
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (saver.hasUnsavedChanges()) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [saver])

  async function loadServerVersion() {
    setLoadError(null)
    try {
      const current = state.conflictNote ?? (await getNote(note.id))
      const draft = saver.loadServerVersion(current)
      setTitle(draft.title)
      setBody(draft.body)
      applySavedNote(current)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '불러오지 못했습니다.')
    }
  }

  function deleteNote() {
    remove.mutate(note.id, {
      onSuccess: () => {
        // 떠날 때 남은 입력을 저장하지 않게 한다 (지운 노트에 저장하면 404).
        saver.discard()
        setConfirmingDelete(false)
        onDeleted()
      },
      onError: (e) => {
        setConfirmingDelete(false)
        toast('error', `노트를 삭제하지 못했습니다. ${e.message}`)
      },
    })
  }

  const titleError = state.status === 'invalid' ? state.message : null
  // 새로 만든 노트는 제목부터 고치게 한다.
  const isNew = note.version === 0 && note.body === ''

  return (
    <article className={styles.editor}>
      <header className={styles.topBar}>
        <nav className={styles.breadcrumb} aria-label="노트 위치">
          <TopicDropdown noteId={note.id} />
          <span className={styles.breadcrumbSeparator} aria-hidden>
            ›
          </span>
          <span className={styles.breadcrumbTitle}>{savedTitle}</span>
        </nav>
        <div className={styles.actions}>
          {/* Live Preview(W1-06) 전까지 쓰는 편집·미리보기 전환 */}
          <div className={styles.modes} role="group" aria-label="보기 방식">
            <button type="button" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>
              편집
            </button>
            <button
              type="button"
              aria-pressed={mode === 'preview'}
              onClick={() => setMode('preview')}
            >
              미리보기
            </button>
          </div>
          <SaveStatusIndicator status={state.status} />
          <IconButton
            ref={moreRef}
            icon="more"
            label="노트 메뉴"
            selected={menu !== null}
            aria-haspopup="menu"
            aria-expanded={menu !== null}
            onClick={() => {
              const rect = moreRef.current?.getBoundingClientRect()
              if (rect) setMenu(menu ? null : { x: rect.right, y: rect.bottom + 4 })
            }}
          />
        </div>
      </header>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          align="right"
          label="노트 메뉴"
          onClose={closeMenu}
          items={[{ label: '삭제', icon: 'trash', onSelect: () => setConfirmingDelete(true) }]}
        />
      )}

      <div className={styles.scroll}>
        <div className={styles.content}>
          {state.status === 'conflict' && (
            <Banner
              kind="alert"
              title="다른 곳에서 이 노트가 먼저 수정되었습니다."
              description={loadError ?? '자동 저장을 멈췄습니다. 편집기 내용은 그대로 두었습니다.'}
              action={
                <Button variant="secondary" onClick={loadServerVersion}>
                  다른 곳의 내용 불러오기
                </Button>
              }
            />
          )}
          {state.status === 'deleted' && (
            <Banner
              kind="alert"
              title="다른 곳에서 삭제된 노트입니다"
              description="자동 저장을 멈췄습니다. 편집기 내용은 지우지 않았으니 필요한 부분을 복사할 수 있습니다."
            />
          )}
          {state.status === 'error' && (
            <Banner
              kind="alert"
              title="저장하지 못했습니다."
              description={`${state.message ?? ''} 계속 입력하거나 다시 시도하면 저장합니다.`.trim()}
              action={
                <Button variant="secondary" onClick={() => saver.flush()}>
                  다시 시도
                </Button>
              }
            />
          )}

          <div className={styles.titleField}>
            <input
              className={styles.title}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                saver.edit({ title: e.target.value })
              }}
              onFocus={(e) => isNew && e.target.select()}
              placeholder="제목"
              aria-label="제목"
              aria-invalid={titleError !== null}
              aria-describedby={titleError ? 'title-error' : undefined}
              autoFocus={isNew}
            />
            {titleError && <FieldError id="title-error" message={titleError} />}
          </div>

          {mode === 'edit' ? (
            <textarea
              className={styles.body}
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                saver.edit({ body: e.target.value })
              }}
              placeholder="내용을 입력하세요"
              aria-label="본문"
              autoFocus={!isNew}
            />
          ) : (
            <div className={styles.preview}>
              {body.trim() ? (
                <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
              ) : (
                <p className={styles.previewEmpty}>내용을 입력하세요</p>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={`'${savedTitle}' 노트를 삭제할까요?`}
          description="삭제한 노트는 되돌릴 수 없습니다."
          confirmLabel="삭제"
          pending={remove.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={deleteNote}
        />
      )}
    </article>
  )
}
