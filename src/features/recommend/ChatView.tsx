import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Recommendation } from '../../api'
import { Banner } from '../../components/Banner'
import { Button } from '../../components/Button'
import { Icon, type IconName } from '../../components/Icon'
import {
  CHAT_NOTICE_TEXT,
  MAX_CHAT_MESSAGE_CHARS,
  type ChatConversation,
  type ChatMessage,
  type ChatNotice,
} from './chatConversation'
import styles from './ChatView.module.css'
import { ExternalSourceLink } from './ExternalSourceLink'
import type { ChatSession } from './useChatSession'

interface Props {
  /** 챗봇이 풀어 주는 추천. 근거를 컨텍스트로 보인다. */
  recommendation: Recommendation
  /** 이 카드와의 대화와 스트림 (패널이 들고 있어 추천으로 돌아갔다 와도 이어진다) */
  session: ChatSession
  conversation: ChatConversation
}

/**
 * Figma W3-03 챗봇 · 쉽게 풀어보기: 컨텍스트 · 대화 · 입력.
 * 답은 POST /recommendations/{id}/chat(SSE)으로 받는 대로 보인다 (docs PR #22, useChatSession).
 * 답을 받는 중에는 보내기 대신 중지. 이 화면을 떠나면(추천으로 등) 연결을 끊는다(BE가 AI 호출도 멈춘다).
 */
export function ChatView({ recommendation, session, conversation }: Props) {
  const [question, setQuestion] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const { messages } = conversation
  const { notice, streaming, stop } = session

  // 말이 늘거나 바뀌면 맨 아래로 내린다
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages, notice])

  // 화면을 떠나면 답 받기를 끊는다. 개발 모드(StrictMode)는 effect를 정리했다가 바로 다시 실행하므로,
  // 끊기를 한 틱 미루고 다시 실행되면 취소한다 (그러지 않으면 처음 질문이 바로 끊긴다).
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (leaving.current !== null) clearTimeout(leaving.current)
    leaving.current = null
    return () => {
      leaving.current = setTimeout(stop, 0)
    }
  }, [stop])

  function send() {
    const text = question.trim()
    if (!text || streaming) return
    setQuestion('')
    session.send(text)
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

      <div ref={logRef} className={styles.log} role="log" aria-label="대화" aria-busy={streaming}>
        <ol className={styles.messages}>
          {messages.map((m) => (
            <Message key={m.id} message={m} />
          ))}
        </ol>
        {notice && (
          <div className={styles.notice}>
            <Banner
              kind="alert"
              title={CHAT_NOTICE_TEXT[notice.kind].title}
              description={CHAT_NOTICE_TEXT[notice.kind].description}
              action={
                <NoticeAction notice={notice} onRetry={session.retry} onRestart={session.restart} />
              }
            />
          </div>
        )}
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
          maxLength={MAX_CHAT_MESSAGE_CHARS}
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
        {streaming ? (
          <Button type="button" variant="secondary" onClick={stop}>
            중지
          </Button>
        ) : (
          <Button type="submit" disabled={!question.trim()}>
            보내기
          </Button>
        )}
      </form>
    </div>
  )
}

/** 말 하나. 챗봇 답이 아직 비어 있으면 받는 중 표시, 멈춘 답이면 그 아래에 알린다 */
function Message({ message: m }: { message: ChatMessage }) {
  return (
    <li className={m.role === 'user' ? styles.user : styles.assistant}>
      <div className={styles.bubbleColumn}>
        <p className={styles.bubble}>{m.text || <Icon name="loader" className={styles.spin} />}</p>
        {m.interrupted && <span className={styles.stopped}>답변이 멈췄습니다</span>}
      </div>
    </li>
  )
}

function NoticeAction({
  notice,
  onRetry,
  onRestart,
}: {
  notice: ChatNotice
  onRetry: (text: string) => void
  onRestart: () => void
}) {
  if (notice.kind === 'too_large')
    return (
      <Button variant="secondary" onClick={onRestart}>
        새 대화
      </Button>
    )
  if (notice.retryText === null) return null
  const text = notice.retryText
  return (
    <Button variant="secondary" onClick={() => onRetry(text)}>
      다시 시도
    </Button>
  )
}
