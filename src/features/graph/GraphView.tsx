import { useMemo, useState } from 'react'
import { isApiError } from '../../api'
import { Button } from '../../components/Button'
import { useCapabilities, useGraph, useTopicGraph, useTopics } from '../../data/queries'
import type { TopicColorKey } from '../../lib/topicColors'
import { GalaxyView } from './GalaxyView'
import { GraphCanvas } from './GraphCanvas'
import styles from './GraphView.module.css'
import { graphErrorMessage, legendEntries, selectedEdgeInfo } from './pageGraph'
import { useTopicColorKeys } from './useTopicColorKeys'

interface Props {
  /** 페이지를 연다 (저장 안 된 내용 확인은 App이 한다) */
  onOpenNote: (noteId: string) => void
}

/** Galaxy 경로가 아직 없는 서버(지금 BE)에서 페이지 그래프 위에 보이는 안내 */
export const GALAXY_UNAVAILABLE_NOTICE =
  '주제 단계 그래프(Galaxy)는 아직 서버에서 쓸 수 없어 페이지 그래프를 보여 줍니다.'

/** 주제 → 색 종류. 주제를 못 불러오면 모두 기타 색, 아직 받는 중이면 null */
function useColorKeys() {
  const topics = useTopics()
  const loadedKeys = useTopicColorKeys(topics.data?.topics)
  const colorKeys = useMemo(
    () => loadedKeys ?? (topics.isError ? new Map<string, TopicColorKey>() : null),
    [loadedKeys, topics.isError],
  )
  return { topics, colorKeys }
}

/**
 * 그래프 화면. Galaxy 그래프(주제 단계, FE #44)가 기존 페이지 그래프 자리를 대체한다 (11/16 결정).
 * 최상위 단계(GET /graph/topics)를 먼저 받아 본다. 경로가 없으면(404 NOT_FOUND, 지금 BE·mock 기본) 페이지 그래프를 안내와 함께 보인다.
 * BE #143이 경로를 만들면 저절로 Galaxy가 보인다. 그래프가 꺼져 있으면(AI-off) 페이지 그래프의 꺼짐 안내를 그대로 쓴다.
 */
export function GraphView({ onOpenNote }: Props) {
  const capabilities = useCapabilities()
  const graphOn = capabilities?.graphEnabled === true
  const root = useTopicGraph(null, graphOn)
  const { colorKeys } = useColorKeys()

  if (!graphOn || isApiError(root.error, 'NOT_FOUND')) {
    return (
      <PageGraphView onOpenNote={onOpenNote} notice={graphOn ? GALAXY_UNAVAILABLE_NOTICE : null} />
    )
  }
  if (root.data && colorKeys) {
    return <GalaxyView root={root.data} colorKeys={colorKeys} onOpenNote={onOpenNote} />
  }
  return (
    <div className={styles.view}>
      <header className={styles.topBar}>
        <h1 className={styles.title}>Galaxy</h1>
      </header>
      <div className={styles.stage}>
        <div className={styles.empty}>
          {root.isError ? (
            <div className={styles.emptyBlock} role="alert">
              <p className={styles.hint}>{graphErrorMessage(root.error)}</p>
              <Button variant="secondary" onClick={() => root.refetch()}>
                다시 시도
              </Button>
            </div>
          ) : (
            <p className={styles.hint}>불러오는 중…</p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 페이지 그래프 화면 (Figma W3-13·W3-13b). 노드 = 페이지, 선 = 같은 키워드를 공유하는 두 페이지 (공유 키워드가 여럿이어도 1개).
 * 관계 유형은 보이지 않고, 사용자가 모르는 지식은 그리지 않는다. 오른쪽 패널은 App이 숨긴다.
 * 노드를 누르면 그 페이지를 열고, 선을 누르면 두 페이지가 공유하는 키워드를 작은 카드로 보인다.
 */
function PageGraphView({ onOpenNote, notice }: Props & { notice: string | null }) {
  const capabilities = useCapabilities()
  const graphOff = capabilities?.graphEnabled === false
  const graph = useGraph(capabilities?.graphEnabled === true)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  // 주제를 못 불러오면 모두 기타 색으로 그린다
  const { topics, colorKeys } = useColorKeys()
  const topicList = useMemo(() => topics.data?.topics ?? [], [topics.data])

  // 그래프가 꺼지면 받아 둔 그래프도 보이지 않는다
  const data = graphOff ? undefined : graph.data
  const edge = data ? selectedEdgeInfo(data, selectedEdge) : null
  const legend = data && colorKeys ? legendEntries(data.nodes, topicList, colorKeys) : []

  return (
    <div className={styles.view}>
      <header className={styles.topBar}>
        <h1 className={styles.title}>전체 그래프</h1>
        {data && (
          <span className={styles.caption}>
            페이지 {data.nodes.length} · 연결 {data.edges.length}
          </span>
        )}
      </header>
      {notice && <p className={styles.notice}>{notice}</p>}

      <div className={styles.stage}>
        {data && colorKeys && data.nodes.length > 0 ? (
          <>
            <GraphCanvas
              graph={data}
              colorKeys={colorKeys}
              selectedEdge={edge ? selectedEdge : null}
              onTapNode={onOpenNote}
              onTapEdge={setSelectedEdge}
            />
            {legend.length > 0 && (
              <section className={styles.legend} aria-label="범례">
                <ul className={styles.legendList}>
                  {legend.map((e) => (
                    <li key={e.key} className={styles.legendItem}>
                      <span
                        className={styles.swatch}
                        style={{ background: `var(--color-${e.key})` }}
                        aria-hidden
                      />
                      {e.label}
                    </li>
                  ))}
                </ul>
                <p className={styles.legendNote}>선 = 같은 키워드를 공유하는 페이지</p>
              </section>
            )}
            {edge && (
              <section className={styles.edgeCard} aria-labelledby="graph-edge-title">
                <h2 id="graph-edge-title" className={styles.edgeTitle}>
                  {edge.source.title} — {edge.target.title}
                </h2>
                {edge.keywords.length > 0 && (
                  <>
                    <p className={styles.caption}>공유 키워드 {edge.keywords.length}</p>
                    <ul className={styles.chips} aria-label="공유 키워드">
                      {edge.keywords.map((k) => (
                        <li key={k} className={styles.chip}>
                          {k}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className={styles.edgeActions}>
                  <Button variant="text-link" onClick={() => onOpenNote(edge.source.id)}>
                    {edge.source.title} 열기
                  </Button>
                  <Button variant="text-link" onClick={() => onOpenNote(edge.target.id)}>
                    {edge.target.title} 열기
                  </Button>
                </div>
              </section>
            )}
          </>
        ) : (
          <div className={styles.empty}>
            {graphOff ? (
              <p className={styles.hint}>
                그래프는 아직 사용할 수 없습니다. AI 분석이 켜지면 같은 키워드를 공유하는 페이지가
                선으로 이어집니다.
              </p>
            ) : graph.isError ? (
              <div className={styles.emptyBlock} role="alert">
                <p className={styles.hint}>{graphErrorMessage(graph.error)}</p>
                <Button variant="secondary" onClick={() => graph.refetch()}>
                  다시 시도
                </Button>
              </div>
            ) : data && colorKeys ? (
              <p className={styles.hint}>
                아직 페이지가 없습니다. 페이지를 만들거나 가져오면 여기에 보입니다.
              </p>
            ) : (
              <p className={styles.hint}>불러오는 중…</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
