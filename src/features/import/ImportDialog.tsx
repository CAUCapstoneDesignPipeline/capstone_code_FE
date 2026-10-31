import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { Topic } from '../../api'
import { Button, IconButton } from '../../components/Button'
import { FieldError } from '../../components/FieldError'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toastContext'
import { useImportNote, useTopics } from '../../data/queries'
import { normalizeName } from '../../lib/names'
import styles from './ImportDialog.module.css'
import {
  blockingReason,
  decodeMarkdown,
  isMarkdownFileName,
  previewLines,
  sendable,
  titleFromFileName,
  type ImportItem,
} from './markdownImport'

interface Props {
  /** 처음 고를 주제 (열린 노트의 주제). null이면 미분류 */
  defaultTopicId: string | null
  onOpenNote: (noteId: string) => void
  onClose: () => void
}

const ACCEPT = '.md,.markdown,text/markdown'

async function readFile(file: File, topicId: string | null): Promise<ImportItem> {
  const base = {
    key: crypto.randomUUID(),
    fileName: file.name,
    title: titleFromFileName(file.name),
    topicId,
    status: 'ready' as const,
    error: null,
    noteId: null,
  }
  if (!isMarkdownFileName(file.name)) {
    return { ...base, body: null, readError: 'Markdown(.md) 파일만 가져올 수 있습니다.' }
  }
  try {
    const decoded = decodeMarkdown(await file.arrayBuffer())
    return decoded.ok
      ? { ...base, body: decoded.text, readError: null }
      : { ...base, body: null, readError: decoded.reason }
  } catch {
    return { ...base, body: null, readError: '파일을 읽지 못했습니다.' }
  }
}

/**
 * Markdown 여러 파일 가져오기 (P01·U03). 파일마다 제목·주제를 정하고 미리 본 뒤, POST /notes로 하나씩 만든다.
 * 실패한 파일은 이유를 보여주고 고쳐서 다시 가져올 수 있다. 가져오는 동안에는 닫지 않고 "중단"만 받는다.
 * 분석·추천은 여기서 요청하지 않는다 (업로드와 분석 분리).
 */
export function ImportDialog({ defaultTopicId, onOpenNote, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const topics = useTopics()
  const importNote = useImportNote()
  const toast = useToast()
  const [items, setItems] = useState<ImportItem[]>([])
  const [topicForNew, setTopicForNew] = useState<string | null>(defaultTopicId)
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const stopRef = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  const topicList: Topic[] = topics.data?.topics ?? []
  const toSend = sendable(items)
  const done = items.filter((i) => i.status === 'done').length
  const failed = items.filter((i) => i.status === 'failed').length

  function update(key: string, patch: Partial<ImportItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  }

  async function addFiles(files: FileList | File[]) {
    const list = [...files]
    if (list.length === 0) return
    const read = await Promise.all(list.map((f) => readFile(f, topicForNew)))
    setItems((prev) => [...prev, ...read])
  }

  /** 기본 주제를 바꾸면 아직 가져오지 않은 파일의 주제도 함께 바꾼다 */
  function changeTopicForAll(topicId: string | null) {
    setTopicForNew(topicId)
    setItems((prev) => prev.map((i) => (i.status === 'done' ? i : { ...i, topicId })))
  }

  async function run() {
    const queue = sendable(items)
    if (queue.length === 0) return
    stopRef.current = false
    setRunning(true)
    let ok = 0
    let ng = 0
    for (const item of queue) {
      if (stopRef.current) break
      update(item.key, { status: 'importing', error: null })
      try {
        const note = await importNote.mutateAsync({
          title: normalizeName(item.title),
          topicId: item.topicId,
          body: item.body ?? '',
        })
        update(item.key, { status: 'done', noteId: note.id })
        ok++
      } catch (e) {
        update(item.key, {
          status: 'failed',
          error: e instanceof Error ? e.message : '가져오지 못했습니다.',
        })
        ng++
      }
    }
    setRunning(false)
    if (ok > 0 || ng > 0) {
      toast(
        ng > 0 ? 'error' : 'info',
        ng > 0
          ? `노트 ${ok}개를 가져오고 ${ng}개는 가져오지 못했습니다.`
          : `노트 ${ok}개를 가져왔습니다.`,
      )
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (!running) void addFiles(e.dataTransfer.files)
  }

  function topicSelect(value: string | null, onChange: (v: string | null) => void, label: string) {
    return (
      <select
        className={styles.select}
        aria-label={label}
        value={value ?? ''}
        disabled={running || !topics.data}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      >
        {topicList.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
        <option value="">미분류</option>
      </select>
    )
  }

  function statusLabel(item: ImportItem) {
    switch (item.status) {
      case 'importing':
        return (
          <span className={styles.status}>
            <Icon name="loader" className={styles.spin} />
            가져오는 중
          </span>
        )
      case 'done':
        return (
          <span className={styles.status}>
            <Icon name="check" />
            가져옴
          </span>
        )
      case 'failed':
        return (
          <span className={styles.status}>
            <Icon name="alert" />
            실패
          </span>
        )
      default:
        return null
    }
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="import-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!running) onClose()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!running) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <h2 id="import-dialog-title" className={styles.title}>
        Markdown 가져오기
      </h2>
      <p className={styles.description}>
        Markdown(.md) 파일을 여러 개 골라 노트로 만듭니다. 파일마다 제목과 주제를 정할 수 있습니다.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {items.length === 0 ? (
        <button
          type="button"
          className={styles.dropZone}
          data-dragging={dragging || undefined}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="import" />
          <span>파일을 고르거나 여기로 끌어 놓으세요</span>
          <span className={styles.caption}>.md · .markdown, UTF-8</span>
        </button>
      ) : (
        <>
          <div className={styles.toolbar}>
            <label className={styles.toolbarLabel}>
              주제
              {topicSelect(topicForNew, changeTopicForAll, '가져올 파일 모두의 주제')}
            </label>
            <Button
              variant="secondary"
              icon="plus"
              disabled={running}
              onClick={() => inputRef.current?.click()}
            >
              파일 추가
            </Button>
          </div>

          <ul
            className={styles.list}
            data-dragging={dragging || undefined}
            aria-label="가져올 파일"
          >
            {items.map((item) => {
              const reason = item.status === 'failed' ? item.error : blockingReason(item, items)
              const locked = running || item.status === 'done' || item.status === 'importing'
              const preview = item.body !== null && previewKey === item.key
              return (
                <li key={item.key} className={styles.row}>
                  <div className={styles.rowMain}>
                    <Icon name="note" className={styles.muted} />
                    <div className={styles.fields}>
                      <input
                        className={styles.titleInput}
                        value={item.title}
                        aria-label={`${item.fileName} 제목`}
                        aria-invalid={reason ? true : undefined}
                        disabled={locked || item.readError !== null}
                        maxLength={250}
                        onChange={(e) =>
                          update(item.key, {
                            title: e.target.value,
                            ...(item.status === 'failed' && { status: 'ready', error: null }),
                          })
                        }
                      />
                      <span className={styles.caption}>{item.fileName}</span>
                    </div>
                    {item.readError === null &&
                      (item.status === 'done' ? (
                        <Button
                          variant="text-link"
                          onClick={() => {
                            if (item.noteId) {
                              onOpenNote(item.noteId)
                              onClose()
                            }
                          }}
                        >
                          열기
                        </Button>
                      ) : (
                        topicSelect(
                          item.topicId,
                          (topicId) =>
                            update(item.key, {
                              topicId,
                              ...(item.status === 'failed' && { status: 'ready', error: null }),
                            }),
                          `${item.fileName} 주제`,
                        )
                      ))}
                    {statusLabel(item)}
                    {item.body !== null && (
                      <IconButton
                        icon={preview ? 'chevron-down' : 'chevron-right'}
                        label={preview ? '미리보기 닫기' : '미리보기'}
                        aria-expanded={preview}
                        onClick={() => setPreviewKey(preview ? null : item.key)}
                      />
                    )}
                    {!locked && (
                      <IconButton
                        icon="close"
                        label={`${item.fileName} 빼기`}
                        onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                      />
                    )}
                  </div>
                  {reason && <FieldError message={reason} />}
                  {preview && item.body !== null && (
                    <pre className={styles.preview}>
                      {item.body === '' ? '(빈 파일)' : previewLines(item.body).text}
                      {previewLines(item.body).more && '\n…'}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className={styles.footer}>
        <span className={styles.summary} role="status">
          {items.length > 0 &&
            `${items.length}개 중 ${done}개 가져옴${failed ? ` · ${failed}개 실패` : ''}`}
        </span>
        {running ? (
          <Button
            variant="ghost"
            onClick={() => {
              stopRef.current = true
            }}
          >
            중단
          </Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
        )}
        <Button disabled={running || toSend.length === 0} onClick={() => void run()}>
          {toSend.length > 0 ? `${toSend.length}개 가져오기` : '가져오기'}
        </Button>
      </div>
    </dialog>
  )
}
