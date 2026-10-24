import { useMemo, useState } from 'react'
import type { GraphNode, Topic } from '../../api'
import { Button } from '../../components/Button'
import { useGraph, useTopics } from '../../data/queries'
import { nodeColorKey, type TopicColorKey } from '../../lib/topicColors'
import { GraphCanvas } from './GraphCanvas'
import styles from './GraphView.module.css'
import { useTopicColorKeys } from './useTopicColorKeys'

interface Props {
  /** 근거 노트를 연다 (저장 안 된 내용 확인은 App이 한다) */
  onOpenNote: (noteId: string) => void
}

/**
 * 전체 그래프 화면 v0 (F-VIZ-01). 개념을 근거 노트의 주제 색으로 칠한다.
 * 노드를 누르면 근거 노트로 간다. 근거 노트가 여럿이면 오른쪽 패널에 목록을 보이고 거기서 고른다.
 */
export function GraphView({ onOpenNote }: Props) {
  const graph = useGraph()
  const topics = useTopics()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const topicList = useMemo(() => topics.data?.topics ?? [], [topics.data])
  // 주제를 못 불러오면 모두 기타 색으로 그린다
  const loadedKeys = useTopicColorKeys(topics.data?.topics)
  const colorKeys = useMemo(
    () => loadedKeys ?? (topics.isError ? new Map<string, TopicColorKey>() : null),
    [loadedKeys, topics.isError],
  )

  const nodes = graph.data?.nodes ?? []
  const selected = nodes.find((n) => n.id === selectedId) ?? null

  function tapNode(nodeId: string | null) {
    const node = nodes.find((n) => n.id === nodeId)
    if (node?.notes.length === 1) onOpenNote(node.notes[0].id)
    else setSelectedId(node?.id ?? null)
  }

  return (
    <div className={styles.view}>
      <header className={styles.topBar}>
        <h1 className={styles.title}>전체 그래프</h1>
        {graph.data && (
          <span className={styles.caption}>
            개념 {graph.data.nodes.length} · 관계 {graph.data.edges.length}
          </span>
        )}
      </header>

      <div className={styles.body}>
        <div className={styles.stage}>
          {graph.data && colorKeys && nodes.length > 0 ? (
            <GraphCanvas
              graph={graph.data}
              colorKeys={colorKeys}
              selectedId={selectedId}
              onTapNode={tapNode}
            />
          ) : (
            <div className={styles.empty}>
              {graph.isError ? (
                <div className={styles.emptyBlock} role="alert">
                  <p className={styles.hint}>그래프를 불러오지 못했습니다. {graph.error.message}</p>
                  <Button variant="secondary" onClick={() => graph.refetch()}>
                    다시 시도
                  </Button>
                </div>
              ) : graph.data && colorKeys ? (
                <p className={styles.hint}>
                  아직 분석된 개념이 없습니다. 노트에 개념을 쓰고 저장하면 분석이 끝난 뒤 여기에
                  보입니다.
                </p>
              ) : (
                <p className={styles.hint}>불러오는 중…</p>
              )}
            </div>
          )}
        </div>

        <aside className={styles.panel} aria-label="그래프 정보">
          {selected && (
            <section aria-labelledby="graph-selected">
              <h2 id="graph-selected" className={styles.sectionLabel}>
                {selected.label}
              </h2>
              <p className={styles.hint}>근거 노트 {selected.notes.length}개 · 눌러서 열기</p>
              <ul className={styles.list}>
                {selected.notes.map((n) => (
                  <li key={n.id}>
                    <button type="button" className={styles.row} onClick={() => onOpenNote(n.id)}>
                      <span className={styles.rowLabel}>{n.title}</span>
                      <span className={styles.caption}>{topicName(topicList, n.topicId)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {colorKeys && <Legend nodes={nodes} topics={topicList} colorKeys={colorKeys} />}

          {colorKeys && nodes.length > 0 && (
            <section aria-labelledby="graph-concepts">
              <h2 id="graph-concepts" className={styles.sectionLabel}>
                개념
              </h2>
              <ul className={styles.list}>
                {[...nodes]
                  .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
                  .map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={styles.row}
                        aria-pressed={n.id === selectedId}
                        onClick={() => tapNode(n.id)}
                      >
                        <Swatch colorKey={nodeColorKey(n, colorKeys)} />
                        <span className={styles.rowLabel}>{n.label}</span>
                        <span className={styles.caption}>노트 {n.notes.length}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

function topicName(topics: readonly Topic[], topicId: string | null) {
  if (topicId === null) return '미분류'
  return topics.find((t) => t.id === topicId)?.name ?? '알 수 없는 주제'
}

/** 범례: 그래프에 실제로 나온 색만 보인다. 색만으로 구분하지 않도록 이름을 함께 쓴다. */
function Legend({
  nodes,
  topics,
  colorKeys,
}: {
  nodes: readonly GraphNode[]
  topics: readonly Topic[]
  colorKeys: ReadonlyMap<string, TopicColorKey>
}) {
  const used = new Set(nodes.map((n) => nodeColorKey(n, colorKeys)))
  const entries: { key: TopicColorKey; label: string }[] = [
    ...topics
      .filter((t) => colorKeys.get(t.id) !== 'topic-other' && used.has(colorKeys.get(t.id)!))
      .map((t) => ({ key: colorKeys.get(t.id)!, label: t.name })),
    ...(used.has('topic-other') ? [{ key: 'topic-other' as const, label: '기타 주제' }] : []),
    ...(used.has('topic-none') ? [{ key: 'topic-none' as const, label: '미분류' }] : []),
    ...(used.has('topic-mixed') ? [{ key: 'topic-mixed' as const, label: '여러 주제' }] : []),
  ]
  if (entries.length === 0) return null
  return (
    <section aria-labelledby="graph-legend">
      <h2 id="graph-legend" className={styles.sectionLabel}>
        주제
      </h2>
      <ul className={styles.legend}>
        {entries.map((e) => (
          <li key={e.key} className={styles.legendItem}>
            <Swatch colorKey={e.key} />
            {e.label}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Swatch({ colorKey }: { colorKey: TopicColorKey }) {
  return (
    <span
      className={
        colorKey === 'topic-mixed' ? `${styles.swatch} ${styles.swatchMixed}` : styles.swatch
      }
      style={colorKey === 'topic-mixed' ? undefined : { background: `var(--color-${colorKey})` }}
      aria-hidden
    />
  )
}
