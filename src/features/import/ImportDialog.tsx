import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Button, IconButton } from '../../components/Button'
import { Icon, type IconName } from '../../components/Icon'
import { TopicSelect } from '../../components/TopicSelect'
import { useTopics } from '../../data/queries'
import styles from './ImportDialog.module.css'
import {
  ACCEPT,
  decodeText,
  FORMATS_LABEL,
  formatSize,
  isImportableFileName,
  UNSUPPORTED_REASON,
  type PickedFile,
} from './markdownImport'
import type { ImportRow, ImportRun } from './useImportRunner'

interface Props {
  /** 진행 중이거나 끝난 가져오기. null이면 파일 고르기 화면 */
  run: ImportRun | null
  /** 넣을 주제 기본값 (W3-04: 지금 열린 노트의 주제). null이면 미분류 */
  defaultTopicId: string | null
  onStart: (files: PickedFile[], topicId: string | null, topicName: string) => void
  /** 대화 상자만 닫는다. 진행 중이면 가져오기는 계속된다 */
  onClose: () => void
  /** 결과 화면의 확인: 결과를 지우고 닫는다 */
  onDone: () => void
}

async function readFile(file: File): Promise<PickedFile> {
  const base = { key: crypto.randomUUID(), fileName: file.name, size: file.size }
  if (!isImportableFileName(file.name)) return { ...base, body: null, reason: UNSUPPORTED_REASON }
  try {
    const decoded = decodeText(await file.arrayBuffer())
    return decoded.ok
      ? { ...base, body: decoded.text, reason: null }
      : { ...base, body: null, reason: decoded.reason }
  } catch {
    return { ...base, body: null, reason: '파일을 읽지 못했습니다.' }
  }
}

/**
 * 노트 가져오기 대화 상자 (Figma W3-04 파일 선택 · W3-05 진행 중 · W3-06 결과).
 * 렌더링되면 열리고 부모가 빼면 닫힌다. 진행 중에 닫아도 가져오기는 사이드바의 useImportRunner에서 계속된다.
 */
export function ImportDialog(props: Props) {
  const { run, onClose, onDone } = props
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="import-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        if (run?.finished) onDone()
        else onClose()
      }}
    >
      {run === null ? (
        <PickStep {...props} />
      ) : run.finished ? (
        <ResultStep run={run} onDone={onDone} />
      ) : (
        <ProgressStep run={run} onClose={onClose} />
      )}
    </dialog>
  )
}

/** W3-04 가져오기 · 파일 선택 */
function PickStep({ defaultTopicId, onStart, onClose }: Props) {
  const topics = useTopics()
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<PickedFile[]>([])
  const [topicId, setTopicId] = useState<string | null>(defaultTopicId)
  const [dragging, setDragging] = useState(false)
  // 지원하지 않는 파일은 목록에 남기되 개수에서 뺀다 (W3-04)
  const importable = files.filter((f) => f.reason === null)
  const topicName =
    topicId === null ? '미분류' : (topics.data?.topics.find((t) => t.id === topicId)?.name ?? '')

  async function add(list: FileList | File[]) {
    const read = await Promise.all([...list].map(readFile))
    setFiles((prev) => [...prev, ...read])
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void add(e.dataTransfer.files)
  }

  return (
    <>
      <h2 id="import-dialog-title" className={styles.title}>
        노트 가져오기
      </h2>
      <p className={styles.description}>
        파일을 노트로 가져옵니다. 가져온 노트는 저장할 때처럼 분석해 새로운 지식을 추천합니다.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void add(e.target.files)
          e.target.value = ''
        }}
      />
      <div
        className={styles.dropZone}
        data-dragging={dragging || undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={onDrop}
      >
        <Icon name="import" />
        <span>파일을 여기에 끌어 놓거나</span>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          파일 선택
        </Button>
        <span className={styles.caption}>지원 형식: {FORMATS_LABEL} · 여러 개 선택 가능</span>
      </div>

      {files.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionLabel}>선택한 파일 {files.length}개</h3>
          <ul className={styles.fileList}>
            {files.map((f) => (
              <FileRow
                key={f.key}
                icon={f.reason ? 'alert' : 'note'}
                name={f.fileName}
                meta={f.reason ?? formatSize(f.size)}
                tone={f.reason ? 'excluded' : undefined}
                action={
                  <IconButton
                    icon="close"
                    label={`${f.fileName} 빼기`}
                    onClick={() => setFiles((prev) => prev.filter((p) => p.key !== f.key))}
                  />
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>넣을 주제</h3>
        <div>
          <TopicSelect
            topics={topics.data?.topics}
            value={topicId}
            header="넣을 주제"
            triggerLabel={(name) => `넣을 주제: ${name}`}
            onChange={(id) => setTopicId(id)}
          />
        </div>
      </section>

      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button
          disabled={importable.length === 0 || !topics.data}
          onClick={() => onStart(importable, topicId, topicName)}
        >
          {importable.length > 0 ? `${importable.length}개 가져오기` : '가져오기'}
        </Button>
      </div>
    </>
  )
}

const PROGRESS: Record<ImportRow['status'], { icon: IconName; label: string }> = {
  done: { icon: 'check', label: '완료' },
  importing: { icon: 'loader', label: '가져오는 중' },
  waiting: { icon: 'clock', label: '대기' },
  failed: { icon: 'alert', label: '가져오지 못함' },
}

/** W3-05 가져오기 · 진행 중 */
function ProgressStep({ run, onClose }: { run: ImportRun; onClose: () => void }) {
  const total = run.rows.length
  const finished = run.rows.filter((r) => r.status === 'done' || r.status === 'failed').length
  return (
    <>
      <h2 id="import-dialog-title" className={styles.title}>
        가져오는 중… ({finished}/{total})
      </h2>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="가져오기 진행"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={finished}
      >
        <div className={styles.progressFill} style={{ width: `${(finished / total) * 100}%` }} />
      </div>
      <ul className={styles.fileList}>
        {run.rows.map((r) => (
          <FileRow
            key={r.key}
            icon={PROGRESS[r.status].icon}
            spin={r.status === 'importing'}
            name={r.fileName}
            meta={PROGRESS[r.status].label}
            tone={r.status === 'waiting' ? 'pending' : undefined}
          />
        ))}
      </ul>
      <p className={styles.caption}>창을 닫아도 가져오기는 계속됩니다. 끝나면 알려 드립니다.</p>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          닫기
        </Button>
      </div>
    </>
  )
}

/** W3-06 가져오기 · 결과. 형식 때문에 뺀 파일은 고를 때 걸러서 여기에는 나오지 않는다. */
function ResultStep({ run, onDone }: { run: ImportRun; onDone: () => void }) {
  const done = run.rows.filter((r) => r.status === 'done')
  const failed = run.rows.filter((r) => r.status === 'failed')
  return (
    <>
      <h2 id="import-dialog-title" className={styles.title}>
        {done.length > 0 ? `노트 ${done.length}개를 가져왔습니다` : '노트를 가져오지 못했습니다'}
      </h2>
      {done.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionLabel}>가져온 노트 · {run.topicName}</h3>
          <ul className={styles.fileList}>
            {done.map((r) => (
              <FileRow
                key={r.key}
                icon="check"
                name={r.title}
                meta={
                  r.renamed
                    ? `같은 제목이 있어 번호를 붙였습니다 · ${run.topicName}`
                    : run.topicName
                }
              />
            ))}
          </ul>
        </section>
      )}
      {failed.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionLabel}>가져오지 못한 파일</h3>
          <ul className={styles.fileList}>
            {failed.map((r) => (
              <FileRow key={r.key} icon="alert" name={r.fileName} meta={r.error ?? ''} />
            ))}
          </ul>
        </section>
      )}
      <div className={styles.actions}>
        <Button onClick={onDone} autoFocus>
          확인
        </Button>
      </div>
    </>
  )
}

/** W3-04~06 FileRow: 아이콘 · 이름 · 설명(크기·상태·이유) · (빼기) */
function FileRow(props: {
  icon: IconName
  name: string
  meta: string
  /** excluded: 가져오지 않는 파일(배경 + 흐린 글자), pending: 대기(흐린 글자) */
  tone?: 'excluded' | 'pending'
  spin?: boolean
  action?: ReactNode
}) {
  return (
    <li className={styles.fileRow} data-tone={props.tone}>
      <Icon name={props.icon} className={props.spin ? styles.spin : undefined} />
      <div className={styles.fileText}>
        <span className={styles.fileName}>{props.name}</span>
        <span className={styles.fileMeta}>{props.meta}</span>
      </div>
      {props.action}
    </li>
  )
}
