import { useState, type Ref } from 'react'
import { Button, IconButton } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { ChatView } from './ChatView'
import styles from './RecommendPanel.module.css'
import { SAMPLE_FIRST_MESSAGE, type ChatMessage } from './sampleChat'
import {
  SAMPLE_RECOMMENDATION,
  type ExternalEvidence,
  type NoteEvidence,
  type Recommendation,
} from './sampleRecommendation'

interface Props {
  /** 패널을 접는다 */
  onCollapse: () => void
  /** 접기 버튼. 패널을 다시 펼치면 여기로 초점을 돌려준다. */
  collapseRef?: Ref<HTMLButtonElement>
}

/** 추천을 읽고 고르는 답 (Figma W3-02 Recommend/Actions) */
const RESPONSES = [
  { id: 'understood', label: '이해함', variant: 'primary' },
  { id: 'known', label: '알고 있던 내용', variant: 'secondary' },
  { id: 'confused', label: '이해가 안 됨', variant: 'secondary' },
] as const

type ResponseId = (typeof RESPONSES)[number]['id']

/**
 * 3단 레이아웃의 오른쪽 칸. 새 지식을 추천하고(Figma W3-02), "이해가 안 됨"을 고르면
 * 같은 패널에서 챗봇이 쉽게 풀어 준다(W3-03).
 */
export function RecommendPanel({ onCollapse, collapseRef }: Props) {
  const recommendation = SAMPLE_RECOMMENDATION
  const [view, setView] = useState<'recommend' | 'chat'>('recommend')
  // 답을 보낼 API가 아직 없어 이 화면에서만 기억한다.
  const [response, setResponse] = useState<ResponseId | null>(null)
  // 추천으로 돌아갔다 와도 대화를 이어 간다.
  const [messages, setMessages] = useState<ChatMessage[]>([])

  function respond(id: ResponseId) {
    setResponse(id)
    if (id !== 'confused') return
    if (messages.length === 0) setMessages([SAMPLE_FIRST_MESSAGE])
    setView('chat')
  }

  return (
    <aside className={styles.panel} aria-labelledby="recommend-panel-title">
      <header className={styles.header}>
        <h2 id="recommend-panel-title" className={styles.title}>
          {view === 'recommend' ? '새로운 지식 추천' : '챗봇 · 쉽게 풀어보기'}
        </h2>
        {view === 'chat' && (
          <Button variant="text-link" onClick={() => setView('recommend')}>
            추천으로
          </Button>
        )}
        <IconButton
          ref={collapseRef}
          icon="panel-right-close"
          label="패널 접기"
          className={styles.toggle}
          onClick={onCollapse}
        />
      </header>

      {view === 'recommend' ? (
        <RecommendView recommendation={recommendation} response={response} onRespond={respond} />
      ) : (
        <ChatView
          recommendation={recommendation}
          messages={messages}
          onMessagesChange={setMessages}
        />
      )}
    </aside>
  )
}

/** Figma W3-02 Recommend/Body + Actions: 근거 A·B와 외부 지식을 이어 결론을 보이고 답을 받는다 */
function RecommendView({
  recommendation,
  response,
  onRespond,
}: {
  recommendation: Recommendation
  response: ResponseId | null
  onRespond: (id: ResponseId) => void
}) {
  const responseLabel = RESPONSES.find((r) => r.id === response)?.label
  return (
    <>
      <div className={styles.body}>
        <section className={styles.section} aria-labelledby="recommend-a">
          <h3 id="recommend-a" className={styles.label}>
            근거 A
          </h3>
          <EvidenceQuote evidence={recommendation.a} />
        </section>
        <section className={styles.section} aria-labelledby="recommend-b">
          <h3 id="recommend-b" className={styles.label}>
            근거 B
          </h3>
          <EvidenceQuote evidence={recommendation.b} />
        </section>
        <section className={styles.section} aria-labelledby="recommend-external">
          <h3 id="recommend-external" className={styles.label}>
            외부 지식
          </h3>
          <EvidenceQuote evidence={recommendation.external} />
        </section>
        <span className={styles.arrow} aria-hidden>
          ↓
        </span>
        <section className={styles.conclusion} aria-labelledby="recommend-conclusion">
          <h3 id="recommend-conclusion" className={styles.label}>
            결론
          </h3>
          <p className={styles.conclusionText}>{recommendation.conclusion}</p>
        </section>
      </div>

      <div className={styles.footer}>
        <div className={styles.actions} role="group" aria-label="이 추천에 대한 답">
          {RESPONSES.map((r) => (
            <Button
              key={r.id}
              variant={r.variant}
              className={styles.action}
              aria-pressed={response === r.id}
              onClick={() => onRespond(r.id)}
            >
              {r.label}
            </Button>
          ))}
        </div>
        {responseLabel && (
          <p className={styles.recorded} role="status">
            답을 남겼습니다: {responseLabel}
          </p>
        )}
      </div>
    </>
  )
}

/**
 * Figma EvidenceQuote: 출처(노트 제목 · 주제, 또는 외부 주소) + 저장된 원문 문장 그대로.
 * surface-emphasis + 왼쪽 ink 2px. 누르면 노트를 열고 문장을 강조할 예정이다 (지금은 예시라 열 노트가 없다).
 */
function EvidenceQuote({ evidence }: { evidence: NoteEvidence | ExternalEvidence }) {
  return (
    <figure className={styles.evidence}>
      <figcaption className={styles.source}>
        {evidence.kind === 'note' ? (
          <>
            <Icon name="note" />
            <span className={styles.sourceName}>{evidence.noteTitle}</span>
            {evidence.topicName && (
              <span className={styles.sourceTopic}>· {evidence.topicName}</span>
            )}
          </>
        ) : (
          <>
            <Icon name="external" />
            <span className={styles.sourceName}>{evidence.source}</span>
          </>
        )}
      </figcaption>
      <blockquote className={styles.quote}>{evidence.quote}</blockquote>
    </figure>
  )
}
