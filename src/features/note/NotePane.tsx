import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { isApiError, type RecommendationEvidence } from '../../api'
import { Button } from '../../components/Button'
import { useToast } from '../../components/toastContext'
import { keys, useNote, useNoteAnalysis } from '../../data/queries'
import { NoteEditor, type LeaveGuard, type NoteEditorHandle } from '../editor/NoteEditor'
import styles from './NotePane.module.css'

/** 추천 카드에서 누른 근거 (W3-12). seq가 바뀌면 다시 강조한다 */
export interface EvidenceRequest {
  evidence: RecommendationEvidence
  seq: number
}

/** W3-12b: 노트를 열었지만 근거 문장을 찾지 못했을 때 */
export const EVIDENCE_MISSING_MESSAGE =
  '근거 문장이 지금 노트에 없습니다. 분석한 뒤 노트가 바뀌었습니다.'

interface Props {
  noteId: string | null
  /** 이 노트에서 강조할 근거. 없으면 null */
  evidenceRequest?: EvidenceRequest | null
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
  evidenceRequest,
  registerLeaveGuard,
  onNoteGone,
}: { noteId: string } & Omit<Props, 'noteId'>) {
  const note = useNote(noteId)
  // 편집기 상단 막대가 분석 상태를 보여 준다.
  const analysis = useNoteAnalysis(noteId)
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

  // 근거로 이동 (W3-12·12b): 편집기가 생긴 뒤 근거 문장을 강조한다. 위치가 밀렸으면 가장 가까운 같은 문장,
  // 같은 문장이 없으면 강조하지 않고 알린다. 편집기가 다시 만들어지면(개발 모드 StrictMode 등) 다시 강조하고,
  // 알림은 같은 요청(seq)마다 한 번만 띄운다.
  const editorRef = useRef<NoteEditorHandle>(null)
  const toastedSeq = useRef<number | null>(null)
  const loaded = note.data !== undefined
  useEffect(() => {
    if (!loaded || !evidenceRequest) return
    const result = editorRef.current?.showEvidence(evidenceRequest.evidence)
    if (result === 'missing' && toastedSeq.current !== evidenceRequest.seq) {
      toastedSeq.current = evidenceRequest.seq
      toast('info', EVIDENCE_MISSING_MESSAGE)
    }
  }, [loaded, evidenceRequest, toast])

  // 한 번 불러온 뒤에는 이후 오류가 나도 편집기를 유지한다 (편집 중인 내용을 지우지 않는다).
  if (note.data) {
    return (
      <NoteEditor
        ref={editorRef}
        note={note.data}
        registerLeaveGuard={registerLeaveGuard}
        onDeleted={onNoteGone}
        analysis={analysis.data}
      />
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
