import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { AnalysisJob, ConceptInNote, EvidenceSpan, NoteGraph, Relation } from '../../api'
import type { EvidenceLocation } from '../editor/evidenceHighlight'
import { DashedBadge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { keys, useCapabilities, useNoteGraph, useRequestAnalysis } from '../../data/queries'
import { analysisMismatch, isAnalysisActive } from '../../lib/analysisPoll'
import styles from './NoteGraphPanel.module.css'

/** 편집기에 근거 문장을 강조한다. null이면 지운다. 찾은 결과(편집기가 없으면 null)를 돌려준다. */
export type ShowEvidence = (evidence: EvidenceSpan | null) => EvidenceLocation['kind'] | null

interface Props {
  noteId: string
  /** 폴링 중인 가장 최근 분석 작업 (불러오기 전이면 undefined) */
  job: AnalysisJob | null | undefined
  onShowEvidence: ShowEvidence
}

/** 노트 옆 오른쪽 패널: 이 노트에서 나온 개념과 관계 (F-GRA-03) */
export function NoteGraphPanel({ noteId, job, onShowEvidence }: Props) {
  const capabilities = useCapabilities()
  const graph = useNoteGraph(noteId, capabilities?.graphEnabled === true)
  const qc = useQueryClient()
  const retry = useRequestAnalysis(noteId)

  // 폴링한 작업과 그래프의 작업이 어긋나면 다시 받는다 (analysisMismatch).
  const shown = graph.data?.analysis
  const mismatch = analysisMismatch(job, graph.data ? shown : undefined)
  useEffect(() => {
    if (mismatch.graph) void qc.invalidateQueries({ queryKey: keys.noteGraph(noteId) })
  }, [mismatch.graph, qc, noteId])
  useEffect(() => {
    if (mismatch.analysis) void qc.invalidateQueries({ queryKey: keys.noteAnalysis(noteId) })
  }, [mismatch.analysis, qc, noteId])

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
      {capabilities && !capabilities.graphEnabled ? (
        // AI-off: 요청하지 않고 알린다
        <p className={styles.hint}>
          {capabilities.analysisEnabled
            ? '개념·관계 보기는 아직 사용할 수 없습니다.'
            : 'AI 분석은 아직 사용할 수 없습니다. 노트 편집과 저장은 그대로 됩니다.'}
        </p>
      ) : graph.data ? (
        <GraphContent graph={graph.data} job={current} onShowEvidence={onShowEvidence} />
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

const LOCATION_HINT: Partial<Record<EvidenceLocation['kind'], string>> = {
  moved: '분석한 뒤 본문이 바뀌어, 같은 문장을 찾아 표시했습니다.',
  missing: '이 문장은 지금 본문에 없습니다. 분석한 뒤 고쳐졌습니다.',
}

function GraphContent({
  graph,
  job,
  onShowEvidence,
}: {
  graph: NoteGraph
  job: AnalysisJob | null | undefined
  onShowEvidence: ShowEvidence
}) {
  const [selectedConceptId, setConceptId] = useState<string | null>(null)
  const [relationId, setRelationId] = useState<string | null>(null)
  /** 편집기에 강조한 근거와 찾은 결과 */
  const [shown, setShown] = useState<{
    evidenceId: string
    result: EvidenceLocation['kind'] | null
  } | null>(null)

  function show(evidence: EvidenceSpan | null) {
    const result = onShowEvidence(evidence)
    setShown(evidence ? { evidenceId: evidence.id, result } : null)
  }

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

  /** 관계를 고르면 첫 근거를 편집기에 강조한다. 다시 누르면 닫고 강조를 지운다. */
  function toggleRelation(relation: Relation) {
    const closing = relation.id === selected?.id
    setRelationId(closing ? null : relation.id)
    show(closing ? null : (relation.evidence[0] ?? null))
  }

  /** 개념을 골라 고른 관계가 목록에서 빠지면 강조도 지운다. */
  function toggleConcept(id: string) {
    const next = id === conceptId ? null : id
    setConceptId(next)
    if (selected && next && selected.source.id !== next && selected.target.id !== next) {
      setRelationId(null)
      show(null)
    }
  }

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
                onClick={() => toggleConcept(c.id)}
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
                  onClick={() => toggleRelation(r)}
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
          <>
            <ul className={styles.list}>
              {selected.evidence.map((e) => (
                <li key={e.id}>
                  <EvidenceQuote
                    evidence={e}
                    selected={e.id === shown?.evidenceId}
                    onClick={() => show(e)}
                  />
                </li>
              ))}
            </ul>
            {shown?.result && LOCATION_HINT[shown.result] && (
              <p className={styles.hint} role="status">
                {LOCATION_HINT[shown.result]}
              </p>
            )}
          </>
        ) : (
          <p className={styles.hint}>관계를 누르면 근거 문장이 보이고 본문에 표시됩니다.</p>
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

/**
 * Figma EvidenceQuote: 노트 제목 + 주제 + 저장된 원문 문장 그대로. surface-emphasis + 왼쪽 ink 2px.
 * 누르면 편집기에서 그 문장을 강조하고 그 자리로 간다. 고른 근거는 surface-selected.
 */
function EvidenceQuote({
  evidence,
  selected,
  onClick,
}: {
  evidence: EvidenceSpan
  selected: boolean
  onClick: () => void
}) {
  const source = [evidence.topic?.name, evidence.noteTitle].filter(Boolean).join(' › ')
  return (
    <button type="button" className={styles.evidence} aria-pressed={selected} onClick={onClick}>
      <span className={styles.quote}>{evidence.quote}</span>
      <span className={styles.caption}>
        {source}
        {evidence.status === 'lost' && ' · 근거 소실'}
      </span>
    </button>
  )
}
