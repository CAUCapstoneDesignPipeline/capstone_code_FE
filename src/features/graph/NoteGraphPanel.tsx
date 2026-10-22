import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { AnalysisJob, ConceptInNote, EvidenceSpan, NoteGraph, Relation } from '../../api'
import { DashedBadge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { keys, useNoteGraph, useRequestAnalysis } from '../../data/queries'
import { isAnalysisActive } from '../../lib/analysisPoll'
import styles from './NoteGraphPanel.module.css'

interface Props {
  noteId: string
  /** 폴링 중인 가장 최근 분석 작업 (불러오기 전이면 undefined) */
  job: AnalysisJob | null | undefined
}

/** 노트 옆 오른쪽 패널: 이 노트에서 나온 개념과 관계 (F-GRA-03) */
export function NoteGraphPanel({ noteId, job }: Props) {
  const graph = useNoteGraph(noteId)
  const qc = useQueryClient()
  const retry = useRequestAnalysis(noteId)

  // 분석이 끝났는데 받아 둔 결과가 그 작업 것이 아니면 다시 받는다. 처음 받는 중이면 기다린다.
  // 끝난 작업마다 한 번씩: 다시 받은 결과가 또 다른 작업 것이면 그 작업을 기준으로 다시 받는다.
  const shown = graph.data?.analysis
  const outdatedBy =
    graph.data &&
    job &&
    !isAnalysisActive(job) &&
    (shown?.id !== job.id || shown.status !== job.status)
      ? `${job.id}:${job.status}:${shown?.id}:${shown?.status}`
      : null
  useEffect(() => {
    if (outdatedBy) void qc.invalidateQueries({ queryKey: keys.noteGraph(noteId) })
  }, [outdatedBy, qc, noteId])

  const current = job === undefined ? shown : job
  return (
    <aside className={styles.panel} aria-label="개념·관계">
      <h2 className={styles.heading}>개념·관계</h2>
      {current?.status === 'failed' && (
        <div className={styles.failed} role="alert">
          <p className={styles.hint}>
            분석하지 못했습니다. {current.errorMessage ?? ''}
            {graph.data?.concepts.length ? ' 아래는 마지막으로 분석한 결과입니다.' : ''}
          </p>
          <Button variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>
            다시 분석
          </Button>
          {retry.isError && <p className={styles.hint}>{retry.error.message}</p>}
        </div>
      )}
      {graph.data ? (
        <GraphContent graph={graph.data} job={current} />
      ) : graph.isError ? (
        <p className={styles.hint} role="alert">
          개념·관계를 불러오지 못했습니다. {graph.error.message}
        </p>
      ) : (
        <p className={styles.hint}>불러오는 중…</p>
      )}
    </aside>
  )
}

function GraphContent({ graph, job }: { graph: NoteGraph; job: AnalysisJob | null | undefined }) {
  const [selectedConceptId, setConceptId] = useState<string | null>(null)
  const [relationId, setRelationId] = useState<string | null>(null)

  if (!job) return <p className={styles.hint}>아직 분석하지 않은 노트입니다.</p>
  if (graph.concepts.length === 0) {
    if (isAnalysisActive(job)) {
      return <p className={styles.hint}>분석이 끝나면 개념과 관계가 보입니다.</p>
    }
    return job.status === 'failed' ? null : (
      <p className={styles.hint}>이 노트에서 찾은 개념이 없습니다.</p>
    )
  }

  // 다시 받은 결과에 고른 개념이 없으면 고르지 않은 것으로 본다.
  const conceptId = graph.concepts.some((c) => c.id === selectedConceptId)
    ? selectedConceptId
    : null
  // 개념을 고르면 그 개념이 들어간 관계만 보인다. 고른 관계가 목록에서 빠지면 상세도 닫는다.
  const relations = conceptId
    ? graph.relations.filter((r) => r.source.id === conceptId || r.target.id === conceptId)
    : graph.relations
  const selected = relations.find((r) => r.id === relationId)

  return (
    <div className={styles.content}>
      <section aria-labelledby="graph-concepts">
        <h3 id="graph-concepts" className={styles.sectionLabel}>
          개념 {graph.concepts.length}
        </h3>
        <ul className={styles.chips}>
          {graph.concepts.map((c) => (
            <li key={c.id}>
              <ConceptChip
                concept={c}
                selected={c.id === conceptId}
                onClick={() => setConceptId(c.id === conceptId ? null : c.id)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="graph-relations">
        <h3 id="graph-relations" className={styles.sectionLabel}>
          관계 {relations.length}
        </h3>
        {relations.length === 0 ? (
          <p className={styles.hint}>
            {conceptId ? '이 개념이 들어간 관계가 없습니다.' : '이 노트에서 찾은 관계가 없습니다.'}
          </p>
        ) : (
          <ul className={styles.list}>
            {relations.map((r) => (
              <li key={r.id}>
                <RelationRow
                  relation={r}
                  selected={r.id === selected?.id}
                  onClick={() => setRelationId(r.id === selected?.id ? null : r.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="graph-evidence">
        <h3 id="graph-evidence" className={styles.sectionLabel}>
          근거
        </h3>
        {selected ? (
          <ul className={styles.list}>
            {selected.evidence.map((e) => (
              <li key={e.id}>
                <EvidenceQuote evidence={e} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>관계를 누르면 근거 문장이 보입니다.</p>
        )}
      </section>
    </div>
  )
}

/** Figma ConceptChip: radius/card, canvas + border-ghost. selected는 surface-selected + ink 테두리 */
function ConceptChip({
  concept,
  selected,
  onClick,
}: {
  concept: ConceptInNote
  selected: boolean
  onClick: () => void
}) {
  const count = concept.mentions.length
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={selected}
      title={`이 노트에 ${count}번 나옵니다`}
      onClick={onClick}
    >
      {concept.label}
      {count > 1 && <span className={styles.chipCount}>{count}</span>}
    </button>
  )
}

/** Figma RelationRow: 개념 → 관계 유형 → 개념. 유형은 caption ink-muted + 화살표 */
function RelationRow({
  relation,
  selected,
  onClick,
}: {
  relation: Relation
  selected: boolean
  onClick: () => void
}) {
  const lost = relation.status === 'evidence_lost'
  return (
    <button
      type="button"
      className={lost ? `${styles.relation} ${styles.relationLost}` : styles.relation}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className={styles.relationConcepts}>
        <span>{relation.source.label}</span>
        <span className={styles.relationType}>{relation.type.label} →</span>
        <span>{relation.target.label}</span>
      </span>
      {(relation.asHypothesis || lost) && (
        <span className={styles.relationMarks}>
          {relation.asHypothesis && <DashedBadge>가설</DashedBadge>}
          {lost && <span className={styles.caption}>근거 소실</span>}
        </span>
      )}
    </button>
  )
}

/** Figma EvidenceQuote: 노트 제목 + 주제 + 저장된 원문 문장 그대로. surface-emphasis + 왼쪽 ink 2px */
function EvidenceQuote({ evidence }: { evidence: EvidenceSpan }) {
  const source = [evidence.topic?.name, evidence.noteTitle].filter(Boolean).join(' › ')
  return (
    <figure className={styles.evidence}>
      <blockquote className={styles.quote}>{evidence.quote}</blockquote>
      <figcaption className={styles.caption}>
        {source}
        {evidence.status === 'lost' && ' · 근거 소실'}
      </figcaption>
    </figure>
  )
}
