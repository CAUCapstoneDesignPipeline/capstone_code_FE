import { useState } from 'react'
import { useMoveNote, useNote, useTopics } from '../../data/queries'
import { moveNoteErrorMessage } from '../../lib/errorMessages'
import styles from './NoteEditor.module.css'

/** 편집기 위쪽의 주제 선택 상자. 고르면 바로 옮긴다. 현재 주제는 캐시에서 읽어 사이드바 끌어 놓기와도 맞춘다. */
export function TopicSelect({ noteId }: { noteId: string }) {
  const note = useNote(noteId)
  const topics = useTopics()
  const move = useMoveNote()
  const [error, setError] = useState<string | null>(null)
  const current = note.data?.topicId ?? null

  return (
    <div className={styles.topicField}>
      <label className={styles.topicLabel}>
        주제
        <select
          className={styles.topicSelect}
          value={current ?? ''}
          disabled={move.isPending || !topics.data}
          onChange={(e) => {
            setError(null)
            move.mutate(
              { noteId, topicId: e.target.value || null },
              { onError: (err) => setError(moveNoteErrorMessage(err)) },
            )
          }}
        >
          <option value="">미분류</option>
          {topics.data?.topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className={styles.topicError} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
