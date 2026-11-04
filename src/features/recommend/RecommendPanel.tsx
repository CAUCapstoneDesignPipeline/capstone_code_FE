import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type Ref } from 'react'
import { flushSync } from 'react-dom'
import type { NoteSummary, Recommendation, RecommendationEvidence } from '../../api'
import { Button, PanelToggleButton } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toastContext'
import {
  keys,
  useCapabilities,
  useNote,
  useRecommendationAnswers,
  useRecommendationDeck,
  useRecommendations,
  useTopics,
} from '../../data/queries'
import {
  ANSWER_FAILED_TOAST,
  ANSWER_TOAST,
  cardAfterAnswer,
  CONFUSED_FAILED_TOAST,
  currentIndex,
  mergeRecommendations,
  newRecommendationsToast,
  removeRecommendation,
  splitRecommendations,
  type RecommendationAnswer,
} from '../../lib/recommendations'
import { StatusPill } from '../editor/StatusPill'
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
const RESPONSES: { id: RecommendationAnswer; label: string; variant: 'primary' | 'secondary' }[] = [
  { id: 'understood', label: '이해함', variant: 'primary' },
  { id: 'known', label: '알고 있던 내용', variant: 'secondary' },
  { id: 'confused', label: '이해가 안 됨', variant: 'secondary' },
]

/**
 * 3단 레이아웃의 오른쪽 칸. 열린 노트의 추천(사용자가 모르는 지식)을 보인다.
 * 분석 중(W3-07) · 없음(W3-08) · 여러 개면 한 장씩 넘김(W3-09). 근거를 누르면 그 노트를 열고 문장을 강조한다(W3-12).
 * 카드는 노트별로 쌓인다 (11/04 회의). 다시 분석하는 동안에도 쌓인 카드를 그대로 두고 헤더 아래에 "분석 중"을 띄우며(W3-16),
 * 끝나면 새 추천을 합친다. 순서는 기본은 BE 순서, 단 지금 보고 있는 카드와 그 앞은 고정, 최대 5장 (mergeRecommendations).
 * '이해함'·'알고 있던 내용'으로 답하면 카드를 빼고 다음 카드로, 마지막이면 "추천을 모두 확인했습니다"(W3-10·11).
 * "이해가 안 됨"을 고르면 같은 패널에서 챗봇이 쉽게 풀어 준다(W3-03).
 */
export function RecommendPanel({ noteId, onOpenEvidence, onCollapse, collapseRef }: Props) {
  const capabilities = useCapabilities()
  const off = capabilities?.discoveriesEnabled === false
  const job = useRecommendations(off ? null : noteId)
  const noteTitle = useNote(noteId ?? '', noteId !== null).data?.title ?? ''
  const { answers, sending, answer } = useRecommendationAnswers()
  const toast = useToast()
  const { deck, update, read } = useRecommendationDeck(off ? null : noteId)
  const completedJob = job.data?.status === 'completed' ? job.data : null
  // 끝난 작업을 아직 합치지 않았으면 합칠 때까지 분석 중으로 본다 (빈 화면이 잠깐 보이지 않게)
  const pending =
    job.data?.status === 'pending' || (completedJob !== null && completedJob.id !== deck.jobId)

  // 답한 카드는 빼고(W3-10·11) 앞 5장만 보인다. 나머지는 대기하다 카드가 빠지면 끝에 붙는다.
  const { visible: list, waiting } = splitRecommendations(deck.cards, answers)
  const allAnswered =
    list.length === 0 &&
    (deck.cards.length > 0 ||
      deck.answeredSinceMerge ||
      (completedJob?.recommendations.length ?? 0) > 0)

  // 여러 개면 한 장씩 (W3-09). 기본은 BE 순서, 단 지금 보고 있는 카드와 그 앞은 고정, 최대 5장.
  // 보고 있는 카드는 노트별로 id로 기억한다. 앞의 카드가 빠지거나(답함) 원래 자리로 돌아와도(전송 실패),
  // 새 추천이 합쳐져도 같은 카드를 보인다.
  const index = currentIndex(list, deck.currentId)
  const current = list[index] ?? null
  const show = (currentId: string | null) => update((d) => ({ ...d, currentId }))
  const goTo = (i: number) => show(list[i]?.id ?? null)

  // 작업이 끝나면 쌓인 카드와 합친다. 처음 받으면 BE 순서대로 앞 5장을 보이고 첫 카드를 본다.
  useEffect(() => {
    if (!completedJob) return
    const before = read()
    if (before.jobId === completedJob.id) return
    const shown = splitRecommendations(before.cards, answers).visible
    const viewing = shown.length > 0 ? shown[currentIndex(shown, before.currentId)].id : null
    const merged = mergeRecommendations(
      before.cards,
      viewing,
      completedJob.recommendations,
      answers,
      sending,
    )
    update(() => ({
      cards: merged.cards,
      currentId: viewing,
      jobId: completedJob.id,
      answeredSinceMerge: false,
    }))
    // 처음 받을 때는 카드가 곧 보이므로 알리지 않는다
    if (before.cards.length > 0 && merged.added > 0) {
      toast('info', newRecommendationsToast(merged.added))
    }
  }, [completedJob, answers, sending, read, update, toast])

  const [view, setView] = useState<'recommend' | 'chat'>('recommend')
  // 추천으로 돌아갔다 와도 대화를 이어 간다.
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // 누른 근거만 표시한다 (W3-12)
  const [shownEvidence, setShownEvidence] = useState<string | null>(null)

  const titleRef = useRef<HTMLHeadingElement>(null)

  /** 화면을 바꾼다. 누른 버튼이 사라지므로 초점을 새 화면의 제목에 두어 처음부터 읽게 한다. */
  function switchView(next: 'recommend' | 'chat') {
    flushSync(() => setView(next))
    titleRef.current?.focus()
  }

  /** 답하면 이 카드는 빠지고 같은 자리에 다음 카드가 온다. '이해가 안 됨'은 카드를 남기고 챗봇으로 */
  function respond(id: RecommendationAnswer) {
    if (!current) return
    const message = ANSWER_TOAST[id]
    // 카드가 빠지면 같은 자리에 오는 다음 카드를 본다 (W3-10)
    // 보이는 카드의 마지막이었으면 그 자리에 붙는 대기 카드를 본다
    if (id !== 'confused') show(cardAfterAnswer([...list, ...waiting], current.id))
    const answeredId = current.id
    answer(answeredId, id).then(
      () => {
        // 확정된 답의 카드는 쌓인 카드에서 뺀다. 전송 중에는 남겨 두어(화면에선 숨김) 실패하면 제자리로 돌아온다
        if (id !== 'confused') {
          update((d) => ({
            ...d,
            cards: removeRecommendation(d.cards, answeredId),
            answeredSinceMerge: true,
          }))
        }
        if (message) toast('info', message)
      },
      // 보내지 못하면 카드는 원래 자리로 돌아오고(보던 카드는 그대로, 개수만 는다), '이해가 안 됨'은 챗봇을 그대로 둔다
      () => toast('error', id === 'confused' ? CONFUSED_FAILED_TOAST : ANSWER_FAILED_TOAST),
    )
    if (id !== 'confused') return
    if (messages.length === 0) setMessages([SAMPLE_FIRST_MESSAGE])
    switchView('chat')
  }

  const chatting = view === 'chat' && current !== null

  return (
    <aside className={styles.panel} aria-labelledby="recommend-panel-title">
      <header className={styles.header}>
        <h2 ref={titleRef} id="recommend-panel-title" className={styles.title} tabIndex={-1}>
          {chatting ? '챗봇 · 쉽게 풀어보기' : '새로운 지식 추천'}
        </h2>
        {chatting && (
          <Button variant="text-link" onClick={() => switchView('recommend')}>
            추천으로
          </Button>
        )}
        {!chatting && pending && list.length === 0 && (
          <span className={styles.status} role="status">
            <Icon name="loader" className={styles.spin} />
            분석 중
          </span>
        )}
        {!chatting && list.length > 1 && (
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
        <PanelToggleButton
          ref={collapseRef}
          icon="panel-right-close"
          label="패널 접기"
          onClick={onCollapse}
        />
      </header>
      {/* W3-16: 쌓인 카드가 있으면 그대로 두고 헤더 아래 줄에 분석 중을 띄운다. 넘기기는 헤더에 그대로 */}
      {!chatting && pending && list.length > 0 && (
        <div className={styles.statusRow}>
          <StatusPill label="분석 중" icon="loader" stuck={false} spinning status="running" />
        </div>
      )}

      {chatting ? (
        <ChatView recommendation={current} messages={messages} onMessagesChange={setMessages} />
      ) : current ? (
        <RecommendView
          recommendation={current}
          onRespond={respond}
          shownEvidence={shownEvidence}
          onOpenEvidence={(side, evidence) => {
            setShownEvidence(`${current.id}:${side}`)
            onOpenEvidence(evidence)
          }}
        />
      ) : pending ? (
        <Analyzing noteTitle={noteTitle} />
      ) : allAnswered ? (
        <AllAnswered />
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

/** W3-11 추천 · 모두 확인함: 남은 카드가 없을 때 */
function AllAnswered() {
  return (
    <div className={styles.empty}>
      <Icon name="check" />
      <p className={styles.emptyTitle}>추천을 모두 확인했습니다</p>
      <p className={styles.emptyText}>
        노트를 저장하거나 가져오면
        <br />
        새로운 연결을 다시 찾습니다.
      </p>
    </div>
  )
}

/** Figma W3-02 Recommend/Body + Actions: 근거 A·B와 외부 지식을 이어 결론을 보이고 답을 받는다 */
function RecommendView({
  recommendation,
  onRespond,
  shownEvidence,
  onOpenEvidence,
}: {
  recommendation: Recommendation
  onRespond: (id: RecommendationAnswer) => void
  shownEvidence: string | null
  onOpenEvidence: (side: 'a' | 'b', evidence: RecommendationEvidence) => void
}) {
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
              onClick={() => onRespond(r.id)}
            >
              {r.label}
            </Button>
          ))}
        </div>
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
