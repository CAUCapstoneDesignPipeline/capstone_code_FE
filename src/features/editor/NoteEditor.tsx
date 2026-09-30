import { useEffect, useState, useSyncExternalStore } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getNote, updateNote, type Note } from '../../api'
import { useApplySavedNote } from '../../data/queries'
import styles from './NoteEditor.module.css'
import { NoteSaver, type SaveStatus } from './noteSaver'

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: '저장됨',
  pending: '저장할 내용 있음',
  saving: '저장 중…',
  invalid: '저장 안 됨',
  error: '저장 안 됨',
  conflict: '저장 안 됨 · 충돌',
  deleted: '저장 안 됨 · 삭제됨',
}

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
}

export function NoteEditor({ note, registerLeaveGuard }: Props) {
  const applySavedNote = useApplySavedNote()
  const [saver] = useState(() => new NoteSaver(note, { save: updateNote, onSaved: applySavedNote }))
  const state = useSyncExternalStore(saver.subscribe, saver.getState)
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [loadError, setLoadError] = useState<string | null>(null)

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

  const titleError = state.status === 'invalid' ? state.message : null
  // 새로 만든 노트는 제목부터 고치게 한다.
  const isNew = note.version === 0 && note.body === ''

  return (
    <article className={styles.editor}>
      <header className={styles.toolbar}>
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
        <span className={styles.status} data-status={state.status} role="status">
          {STATUS_LABEL[state.status]}
        </span>
      </header>

      {state.status === 'conflict' && (
        <div className={styles.banner} role="alert">
          <p>
            다른 곳에서 이 노트가 먼저 수정되었습니다. 자동 저장을 멈췄습니다. 지금 편집기의 내용은
            저장되지 않았습니다.
          </p>
          <button type="button" onClick={loadServerVersion}>
            다른 곳의 내용 불러오기
          </button>
          {loadError && <p>{loadError}</p>}
        </div>
      )}
      {state.status === 'deleted' && (
        <div className={styles.banner} role="alert">
          <p>다른 곳에서 삭제된 노트입니다. 자동 저장을 멈췄습니다. 필요한 내용은 복사해 두세요.</p>
        </div>
      )}
      {state.status === 'error' && (
        <div className={styles.banner} role="alert">
          <p>저장하지 못했습니다. {state.message}</p>
          <button type="button" onClick={() => saver.flush()}>
            다시 시도
          </button>
        </div>
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
        {titleError && (
          <p id="title-error" className={styles.titleError} role="alert">
            {titleError}
          </p>
        )}
      </div>

      {mode === 'edit' ? (
        <textarea
          className={styles.body}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            saver.edit({ body: e.target.value })
          }}
          placeholder="마크다운으로 쓰세요"
          aria-label="본문"
          autoFocus={!isNew}
        />
      ) : (
        <div className={styles.preview}>
          {body.trim() ? (
            <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
          ) : (
            <p className={styles.previewEmpty}>본문이 비어 있습니다.</p>
          )}
        </div>
      )}
    </article>
  )
}
