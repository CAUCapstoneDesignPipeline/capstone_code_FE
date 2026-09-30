import { useId, useState, type FormEvent } from 'react'
import { checkName, normalizeName, TOPIC_NAME_MAX } from '../../lib/names'
import styles from './Sidebar.module.css'

interface Props {
  initialName?: string
  placeholder: string
  /** 서버에 보낸다. 실패하면 오류 문장을 입력칸 아래에 보여준다. */
  onSubmit: (name: string) => Promise<unknown>
  /** 성공하거나 취소하면 부른다 */
  onDone: () => void
  className?: string
}

/** 새 주제 만들기와 주제 이름 바꾸기에 함께 쓰는 입력칸. Enter로 보내고 Esc로 취소한다. */
export function TopicNameForm({
  initialName = '',
  placeholder,
  onSubmit,
  onDone,
  className,
}: Props) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const errorId = useId()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    const problem = checkName(name, '주제 이름', TOPIC_NAME_MAX)
    if (problem) {
      setError(problem)
      return
    }
    if (normalizeName(name) === initialName) {
      onDone()
      return
    }
    setPending(true)
    try {
      await onSubmit(normalizeName(name))
      onDone()
    } catch (err) {
      // TOPIC_NAME_TAKEN, VALIDATION_FAILED 모두 서버가 준 문장을 그대로 보여준다.
      setError(err instanceof Error ? err.message : '저장하지 못했습니다.')
      setPending(false)
    }
  }

  return (
    <form className={className} onSubmit={submit}>
      <input
        className={styles.input}
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone()
        }}
        onBlur={() => {
          // 비워 두거나 그대로 두고 벗어나면 취소한다. 오류가 떠 있으면 고칠 수 있게 남겨 둔다.
          if (!pending && !error && (!name.trim() || normalizeName(name) === initialName)) onDone()
        }}
        onFocus={(e) => e.target.select()}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        disabled={pending}
        maxLength={TOPIC_NAME_MAX * 2}
        autoFocus
      />
      {error && (
        <p id={errorId} className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
