import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Icon, type IconName } from '../../components/Icon'
import styles from './ChatView.module.css'
import { ExternalSourceLink } from './ExternalSourceLink'
import { sampleAnswer, type ChatMessage } from './sampleChat'
import type { Recommendation } from '../../api'

interface Props {
  /** 챗봇이 풀어 주는 추천. 근거를 컨텍스트로 보인다. */
  recommendation: Recommendation
  messages: ChatMessage[]
  onMessagesChange: (messages: ChatMessage[]) => void
}

/** Figma W3-03 챗봇 · 쉽게 풀어보기: 컨텍스트 · 대화 · 입력 */
export function ChatView({ recommendation, messages, onMessagesChange }: Props) {
  const [question, setQuestion] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const turn = messages.filter((m) => m.role === 'user').length

  // 말이 늘거나 바뀌면 맨 아래로 내린다
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages])

  function send() {
    const text = question.trim()
    if (!text) return
    onMessagesChange([
      ...messages,
      { id: crypto.randomUUID(), role: 'user', text },
      sampleAnswer(turn),
    ])
    setQuestion('')
  }

  const context: { icon: IconName; kind: string; source: ReactNode }[] = [
    {
      icon: 'note',
      kind: '근거 A',
      source: <span className={styles.contextSource}>{recommendation.evidenceA.noteTitle}</span>,
    },
    {
      icon: 'note',
      kind: '근거 B',
      source: <span className={styles.contextSource}>{recommendation.evidenceB.noteTitle}</span>,
    },
    // 외부 지식을 쓰지 않은 추천(null)은 컨텍스트에 넣지 않는다 (AI #19)
    ...(recommendation.externalKnowledge
      ? [
          {
            icon: 'external' as const,
            kind: '외부 지식',
            source: (
              <ExternalSourceLink
                url={recommendation.externalKnowledge.sourceUrl}
                className={styles.contextSource}
              />
            ),
          },
        ]
      : []),
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
              {c.source}
            </li>
          ))}
        </ul>
      </section>

      <hr className={styles.divider} />

      <div ref={logRef} className={styles.log} role="log" aria-label="대화">
        <ol className={styles.messages}>
          {messages.map((m) => (
            <li key={m.id} className={m.role === 'user' ? styles.user : styles.assistant}>
              <p className={styles.bubble}>{m.text}</p>
            </li>
          ))}
        </ol>
      </div>

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
            // 한글을 조합하는 중의 Enter는 글자를 확정할 뿐 보내지 않는다.
            // Safari는 조합을 끝낸 뒤 isComposing 없이 keyCode 229로 Enter를 한 번 더 보낸다.
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) {
              e.preventDefault()
            }
          }}
          placeholder="궁금한 점을 입력하세요"
          aria-label="질문"
        />
        <Button type="submit" disabled={!question.trim()}>
          보내기
        </Button>
      </form>
    </div>
  )
}
