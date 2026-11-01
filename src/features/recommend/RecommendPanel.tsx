import { useQueryClient } from '@tanstack/react-query'
import { useState, type Ref } from 'react'
import type { NoteSummary, Recommendation, RecommendationEvidence } from '../../api'
import { Button, IconButton } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { keys, useCapabilities, useNote, useRecommendations, useTopics } from '../../data/queries'
import { ChatView } from './ChatView'
import { ExternalSourceLink } from './ExternalSourceLink'
import styles from './RecommendPanel.module.css'
import { SAMPLE_FIRST_MESSAGE, type ChatMessage } from './sampleChat'

interface Props {
  /** 열린 노트. 그 노트의 가장 최근 추천 작업을 보인다. 없으면 null */
  noteId: string | null
  /** 근거 A·B를 누르면 그 노트를 열고 문장을 강조한다 (W3-12) */
  onOpenEvidence: (evidence: RecommendationEvidence) => void
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
 * 3단 레이아웃의 오른쪽 칸. 열린 노트의 추천(사용자가 모르는 지식)을 보인다.
 * 분석 중(W3-07) · 없음(W3-08) · 여러 개면 한 장씩 넘김(W3-09). 근거를 누르면 그 노트를 열고 문장을 강조한다(W3-12).
 * "이해가 안 됨"을 고르면 같은 패널에서 챗봇이 쉽게 풀어 준다(W3-03).
 */
export function RecommendPanel({ noteId, onOpenEvidence, onCollapse, collapseRef }: Props) {
  const capabilities = useCapabilities()
  const off = capabilities?.discoveriesEnabled === false
  const job = useRecommendations(off ? null : noteId)
  const noteTitle = useNote(noteId ?? '', noteId !== null).data?.title ?? ''
  const pending = job.data?.status === 'pending'
  const list = job.data?.status === 'completed' ? job.data.recommendations : []

  // 여러 개면 한 장씩 (W3-09). 순서는 BE가 준 그대로다. 작업이 바뀌면 처음부터.
  const [page, setPage] = useState({ jobId: '', index: 0 })
  const index = page.jobId === job.data?.id ? Math.min(page.index, list.length - 1) : 0
  const current = list[Math.max(index, 0)] ?? null
  const goTo = (i: number) => setPage({ jobId: job.data?.id ?? '', index: i })

  const [view, setView] = useState<'recommend' | 'chat'>('recommend')
  // 답을 보낼 API(피드백)는 다음 작업에서 붙인다. 지금은 이 화면에서만 기억한다.
  const [responses, setResponses] = useState<Record<string, ResponseId>>({})
  // 추천으로 돌아갔다 와도 대화를 이어 간다.
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // 누른 근거만 표시한다 (W3-12)
  const [shownEvidence, setShownEvidence] = useState<string | null>(null)

  function respond(id: ResponseId) {
    if (!current) return
    setResponses((prev) => ({ ...prev, [current.id]: id }))
    if (id !== 'confused') return
    if (messages.length === 0) setMessages([SAMPLE_FIRST_MESSAGE])
    setView('chat')
  }

  const chatting = view === 'chat' && current !== null

  return (
    <aside className={styles.panel} aria-labelledby="recommend-panel-title">
      <header className={styles.header}>
        <h2 id="recommend-panel-title" className={styles.title}>
          {chatting ? '챗봇 · 쉽게 풀어보기' : '새로운 지식 추천'}
        </h2>
        {chatting && (
          <Button variant="text-link" onClick={() => setView('recommend')}>
            추천으로
          </Button>
        )}
        {!chatting && pending && (
          <span className={styles.status} role="status">
            <Icon name="loader" className={styles.spin} />
            분석 중
          </span>
        )}
        {!chatting && !pending && list.length > 1 && (
          <nav className={styles.pager} aria-label="추천 넘기기">
            <button
              type="button"
              className={styles.pagerButton}
              disabled={index <= 0}
              onClick={() => goTo(index - 1)}
            >
              이전
            </button>
            <span className={styles.pagerCount}>
              {index + 1} / {list.length}
            </span>
            <button
              type="button"
              className={styles.pagerButton}
              disabled={index >= list.length - 1}
              onClick={() => goTo(index + 1)}
            >
              다음
            </button>
          </nav>
        )}
        <IconButton
          ref={collapseRef}
          icon="panel-right-close"
          label="패널 접기"
          className={styles.toggle}
          onClick={onCollapse}
        />
      </header>

      {chatting ? (
        <ChatView recommendation={current} messages={messages} onMessagesChange={setMessages} />
      ) : pending ? (
        <Analyzing noteTitle={noteTitle} />
      ) : current ? (
        <RecommendView
          recommendation={current}
          response={responses[current.id] ?? null}
          onRespond={respond}
          shownEvidence={shownEvidence}
          onOpenEvidence={(side, evidence) => {
            setShownEvidence(`${current.id}:${side}`)
            onOpenEvidence(evidence)
          }}
        />
      ) : (
        <Empty off={off} />
      )}
    </aside>
  )
}

/** W3-07 추천 · 분석 중: 자리 표시만, 버튼 없음 */
function Analyzing({ noteTitle }: { noteTitle: string }) {
  return (
    <div className={styles.body} aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.section}>
          <span className={`${styles.skeleton} ${styles.skeletonLabel}`} />
          <span className={`${styles.skeleton} ${styles.skeletonBlock}`} />
        </div>
      ))}
      <span className={`${styles.skeleton} ${styles.skeletonConclusion}`} />
      <p className={styles.hint}>
        {noteTitle ? `'${noteTitle}'을 분석하고 있습니다. ` : '분석하고 있습니다. '}
        끝나면 새로운 지식을 여기에 보여 드립니다.
      </p>
    </div>
  )
}

/** W3-08 추천 · 없음. 분석 결과가 없거나 보류·탈락뿐이거나, 아직 요청하지 않았을 때 */
function Empty({ off }: { off: boolean }) {
  return (
    <div className={styles.empty}>
      <Icon name="compass" />
      <p className={styles.emptyTitle}>
        {off ? '새로운 지식 추천은 아직 사용할 수 없습니다' : '아직 추천할 새로운 지식이 없습니다'}
      </p>
      {!off && (
        <p className={styles.emptyText}>
          노트를 더 쓰거나 가져오면
          <br />
          노트 사이의 연결을 찾아 추천합니다.
        </p>
      )}
    </div>
  )
}

/** Figma W3-02 Recommend/Body + Actions: 근거 A·B와 외부 지식을 이어 결론을 보이고 답을 받는다 */
function RecommendView({
  recommendation,
  response,
  onRespond,
  shownEvidence,
  onOpenEvidence,
}: {
  recommendation: Recommendation
  response: ResponseId | null
  onRespond: (id: ResponseId) => void
  shownEvidence: string | null
  onOpenEvidence: (side: 'a' | 'b', evidence: RecommendationEvidence) => void
}) {
  const responseLabel = RESPONSES.find((r) => r.id === response)?.label
  const { evidenceA, evidenceB, externalKnowledge } = recommendation
  return (
    <>
      <div className={styles.body}>
        <section className={styles.section} aria-labelledby="recommend-a">
          <h3 id="recommend-a" className={styles.label}>
            근거 A
          </h3>
          <NoteEvidenceButton
            evidence={evidenceA}
            selected={shownEvidence === `${recommendation.id}:a`}
            onClick={() => onOpenEvidence('a', evidenceA)}
          />
        </section>
        <section className={styles.section} aria-labelledby="recommend-b">
          <h3 id="recommend-b" className={styles.label}>
            근거 B
          </h3>
          <NoteEvidenceButton
            evidence={evidenceB}
            selected={shownEvidence === `${recommendation.id}:b`}
            onClick={() => onOpenEvidence('b', evidenceB)}
          />
        </section>
        <section className={styles.section} aria-labelledby="recommend-external">
          <h3 id="recommend-external" className={styles.label}>
            외부 지식
          </h3>
          <figure className={styles.evidence}>
            <figcaption className={styles.source}>
              <Icon name="external" />
              <ExternalSourceLink url={externalKnowledge.sourceUrl} className={styles.sourceName} />
            </figcaption>
            <blockquote className={styles.quote}>{externalKnowledge.summary}</blockquote>
          </figure>
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

/** 근거가 나온 노트의 주제 이름. 사이드바 목록에서 찾고, 모르면 비운다 */
function useNoteTopicName(noteId: string): string | null {
  const qc = useQueryClient()
  const topics = useTopics()
  const summary = qc
    .getQueriesData<NoteSummary[]>({ queryKey: keys.noteLists })
    .flatMap(([, list]) => list ?? [])
    .find((n) => n.id === noteId)
  if (!summary) return null
  if (summary.topicId === null) return '미분류'
  return topics.data?.topics.find((t) => t.id === summary.topicId)?.name ?? null
}

/**
 * Figma EvidenceQuote (W3-02) + 근거로 이동 (W3-12): 노트 제목 · 주제 + 저장된 원문 문장 그대로.
 * 누르면 그 노트를 열고 문장을 강조한다. 누른 근거는 surface-selected로 표시한다.
 */
function NoteEvidenceButton({
  evidence,
  selected,
  onClick,
}: {
  evidence: RecommendationEvidence
  selected: boolean
  onClick: () => void
}) {
  const topicName = useNoteTopicName(evidence.noteId)
  return (
    <button
      type="button"
      className={`${styles.evidence} ${styles.evidenceButton}`}
      aria-pressed={selected}
      aria-label={`${evidence.noteTitle} 열고 근거 문장 보기: ${evidence.quote}`}
      onClick={onClick}
    >
      <span className={styles.source}>
        <Icon name="note" />
        <span className={styles.sourceName}>{evidence.noteTitle}</span>
        {topicName && <span className={styles.sourceTopic}>· {topicName}</span>}
      </span>
      <span className={styles.quote}>{evidence.quote}</span>
    </button>
  )
}
