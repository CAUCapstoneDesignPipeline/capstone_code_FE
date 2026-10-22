import { useState } from 'react'
import type { ConceptInNote, EvidenceSpan, NoteGraph, Relation } from '../../api'
import { DashedBadge } from '../../components/Badge'
import { useNoteGraph } from '../../data/queries'
import styles from './NoteGraphPanel.module.css'

/** 노트 옆 오른쪽 패널: 이 노트에서 나온 개념과 관계 (F-GRA-03) */
export function NoteGraphPanel({ noteId }: { noteId: string }) {
  const graph = useNoteGraph(noteId)
  return (
    <aside className={styles.panel} aria-label="개념·관계">
      <h2 className={styles.heading}>개념·관계</h2>
      {graph.data ? (
        <GraphContent graph={graph.data} />
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

function GraphContent({ graph }: { graph: NoteGraph }) {
  const [conceptId, setConceptId] = useState<string | null>(null)
  const [relationId, setRelationId] = useState<string | null>(null)

  if (!graph.analysis) return <p className={styles.hint}>아직 분석하지 않은 노트입니다.</p>
  if (graph.concepts.length === 0) {
    return <p className={styles.hint}>이 노트에서 찾은 개념이 없습니다.</p>
  }

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
