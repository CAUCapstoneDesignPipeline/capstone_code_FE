import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon, type IconName } from '../../components/Icon'
import styles from './ChatView.module.css'
import { sampleAnswer, type ChatMessage } from './sampleChat'
import type { Recommendation } from './sampleRecommendation'

interface Props {
  /** 챗봇이 풀어 주는 추천. 근거를 컨텍스트로 보인다. */
  recommendation: Recommendation
  messages: ChatMessage[]
  onMessagesChange: (messages: ChatMessage[]) => void
}

/** Figma W3-03 챗봇 · 쉽게 풀어보기: 컨텍스트 · 대화 · 입력 */
export function ChatView({ recommendation, messages, onMessagesChange }: Props) {
  const [question, setQuestion] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const turn = messages.filter((m) => m.role === 'user').length

  // 새 말이 오면 맨 아래로 내린다
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length])

  function send() {
    const text = question.trim()
    if (!text) return
    onMessagesChange([...messages, { role: 'user', text }, sampleAnswer(turn)])
    setQuestion('')
  }

  const context: { icon: IconName; kind: string; source: string }[] = [
    { icon: 'note', kind: '근거 A', source: recommendation.a.noteTitle },
    { icon: 'note', kind: '근거 B', source: recommendation.b.noteTitle },
    { icon: 'external', kind: '외부 지식', source: recommendation.external.source },
  ]

  return (
    <div className={styles.chat}>
      <section className={styles.context} aria-labelledby="chat-context">
        <h3 id="chat-context" className={styles.label}>
          컨텍스트
        </h3>
        <ul className={styles.contextList}>
          {context.map((c) => (
            <li key={c.kind} className={styles.contextItem}>
              <Icon name={c.icon} />
              <span className={styles.contextKind}>{c.kind}</span>
              <span className={styles.contextSource}>{c.source}</span>
            </li>
          ))}
        </ul>
      </section>

      <hr className={styles.divider} />

      <ol ref={listRef} className={styles.messages} role="log" aria-label="대화">
        {messages.map((m, i) => (
          <li key={i} className={m.role === 'user' ? styles.user : styles.assistant}>
            <p className={styles.bubble}>{m.text}</p>
          </li>
        ))}
      </ol>

      <form
        className={styles.input}
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          className={styles.field}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // 한글을 조합하는 중의 Enter는 글자를 확정할 뿐 보내지 않는다
            if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault()
          }}
          placeholder="궁금한 점을 입력하세요"
          aria-label="질문"
          autoFocus
        />
        <Button type="submit" disabled={!question.trim()}>
          보내기
        </Button>
      </form>
    </div>
  )
}
