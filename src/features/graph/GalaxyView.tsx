import { useEffect, useMemo, useRef, useState } from 'react'
import type { TopicGraph } from '../../api'
import { Button } from '../../components/Button'
import { useTopicGraph } from '../../data/queries'
import type { TopicColorKey } from '../../lib/topicColors'
import { GalaxyCanvas, GALAXY_BUTTON_ZOOM, type GalaxyCanvasHandle } from './GalaxyCanvas'
import {
  currentTopicId,
  directKeywords,
  enter,
  galaxyElements,
  goTo,
  isRecommendedKeyword,
  keywordDocs,
  levelSummary,
  ROOT,
  up,
  type GalaxyPath,
} from './galaxy'
import styles from './GraphView.module.css'
import { graphErrorMessage } from './pageGraph'

interface Props {
  /** 최상위 단계 (GraphView가 받아 둔 것) */
  root: TopicGraph
  /** 주제 → 색 종류 (최상위 주제 기준) */
  colorKeys: ReadonlyMap<string, TopicColorKey>
  /** 노트를 연다 (저장 안 된 내용 확인은 App이 한다) */
  onOpenNote: (noteId: string) => void
}

/** 노트를 열었다 돌아와도 보던 단계에서 시작한다 (새로 고치면 처음부터) */
let lastPath: GalaxyPath = ROOT

/**
 * Galaxy 그래프 화면 (FE #44 1단계, Figma W3-22d·e). 주제(폴더) 단계를 재귀적으로 들어간다.
 * 처음은 최상위 주제만(노드 크기 = 키워드 수, 선 = 주제 사이 관련). 주제를 누르거나 줌 인하면 그 주제 안
 * (하위 주제 + 바로 속한 키워드), 빈 곳을 누르거나 줌 아웃하면 한 단계 위. 위의 경로를 누르면 그 단계로.
 * 키워드를 누르면 그 키워드가 나온 문서 목록(W3-20d)을 보이고, 문서를 누르면 노트를 연다.
 * 2D/3D 토글(상단 막대 오른쪽)은 다음 PR이다.
 */
export function GalaxyView({ root, colorKeys, onOpenNote }: Props) {
  const [path, setPathState] = useState<GalaxyPath>(() => lastPath)
  const setPath = (next: GalaxyPath) => {
    setPathState(next)
    setSelectedKeyword(null)
  }
  useEffect(() => {
    lastPath = path
  }, [path])
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null)
  const canvasRef = useRef<GalaxyCanvasHandle>(null)

  const topicId = currentTopicId(path)
  // 최상위는 GraphView가 받아 둔 것을 쓴다
  const level = useTopicGraph(topicId, topicId !== null)
  const graph = topicId === null ? root : level.data
  const elements = useMemo(
    () => (graph ? galaxyElements(graph, path, colorKeys) : null),
    [graph, path, colorKeys],
  )
  const levelKey = path.map((s) => s.id).join('/') || 'root'
  const keyword = graph ? keywordDocs(graph, path, selectedKeyword) : null
  const keywordCount = graph ? directKeywords(graph.keywords, topicId).length : 0
  const empty = graph !== undefined && graph.topics.length === 0 && keywordCount === 0

  /** 이 단계의 주제로 들어간다 */
  function enterTopic(id: string) {
    const t = graph?.topics.find((x) => x.id === id)
    if (t) setPath(enter(path, t))
  }

  /** 빈 곳: 팝업이 열려 있으면 닫고, 아니면 한 단계 위로 */
  function tapBackground() {
    if (selectedKeyword) setSelectedKeyword(null)
    else if (path.length > 0) setPath(up(path))
  }

  // Esc로 팝업을 닫는다
  useEffect(() => {
    if (!selectedKeyword) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedKeyword(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedKeyword])

  const crumbs = (
    <>
      {path.length === 0 ? (
        <span aria-current="page">전체</span>
      ) : (
        <button type="button" className={styles.crumb} onClick={() => setPath(goTo(path, -1))}>
          전체
        </button>
      )}
      {path.map((step, i) => (
        <span key={step.id} className={styles.crumbItem}>
          <span className={styles.crumbSeparator} aria-hidden>
            ›
          </span>
          {i === path.length - 1 ? (
            <span aria-current="page">{step.name}</span>
          ) : (
            <button type="button" className={styles.crumb} onClick={() => setPath(goTo(path, i))}>
              {step.name}
            </button>
          )}
        </span>
      ))}
    </>
  )

  return (
    <div className={styles.view}>
      <header className={styles.topBar}>
        <h1 className={styles.title}>Galaxy</h1>
        <nav className={styles.breadcrumb} aria-label="그래프 단계">
          {path.length > 0 && crumbs}
          {graph && (
            <span className={styles.caption}>
              {path.length > 0 && ' · '}
              {levelSummary(path, graph.topics.length, keywordCount)}
            </span>
          )}
        </nav>
        {/* 오른쪽은 2D/3D 토글 자리 (FE #44 다음 PR) */}
        <div className={styles.topBarEnd} />
      </header>

      <div className={styles.stage}>
        <GalaxyCanvas
          ref={canvasRef}
          levelKey={levelKey}
          elements={elements}
          canGoUp={path.length > 0}
          selectedKeyword={keyword ? keyword.id : null}
          onEnterTopic={enterTopic}
          onUp={() => setPath(up(path))}
          onTapKeyword={setSelectedKeyword}
          onTapBackground={tapBackground}
        />

        {topicId !== null && level.isError ? (
          <div className={styles.overlay} role="alert">
            <p className={styles.hint}>{graphErrorMessage(level.error)}</p>
            <div className={styles.overlayActions}>
              <Button variant="secondary" onClick={() => level.refetch()}>
                다시 시도
              </Button>
              <Button variant="text-link" onClick={() => setPath(up(path))}>
                위 단계로
              </Button>
            </div>
          </div>
        ) : !graph ? (
          <div className={styles.overlay}>
            <p className={styles.hint}>불러오는 중…</p>
          </div>
        ) : empty ? (
          <div className={styles.overlay}>
            <p className={styles.hint}>
              {path.length === 0
                ? '아직 주제가 없습니다. 주제를 만들고 노트를 쓰면 여기에 보입니다.'
                : '이 주제에는 아직 하위 주제나 키워드가 없습니다. 빈 곳을 누르면 위 단계로 갑니다.'}
            </p>
          </div>
        ) : null}

        {/* W3-22d·e ZoomIndicator: − 축소 · 경로 · + 확대. 줌으로 단계를 바꾸는 규칙을 그대로 따른다 */}
        <div className={styles.zoomBar}>
          <button
            type="button"
            className={styles.zoomButton}
            aria-label="축소"
            onClick={() => canvasRef.current?.zoomBy(1 / GALAXY_BUTTON_ZOOM)}
          >
            −
          </button>
          <span className={styles.zoomPath} aria-hidden>
            {['전체', ...path.map((s) => s.name)].join(' › ')}
          </span>
          <button
            type="button"
            className={styles.zoomButton}
            aria-label="확대"
            onClick={() => canvasRef.current?.zoomBy(GALAXY_BUTTON_ZOOM)}
          >
            +
          </button>
        </div>

        {keyword && (
          <section className={styles.docsPopup} aria-labelledby="galaxy-keyword-title">
            <header className={styles.docsHeader}>
              <h2 id="galaxy-keyword-title" className={styles.docsTitle}>
                {keyword.label}
              </h2>
              <Button variant="text-link" onClick={() => setSelectedKeyword(null)}>
                닫기
              </Button>
            </header>
            <p className={styles.caption}>
              {isRecommendedKeyword(keyword) && (
                <span className={styles.recommendedTag}>새로 이해한 지식 · </span>
              )}
              페이지 {keyword.documents.length}개
            </p>
            {keyword.documents.length > 0 ? (
              <ul className={styles.docsList}>
                {keyword.documents.map((d) => (
                  <li key={d.noteId} className={styles.docItem}>
                    <span className={styles.docTitle}>{d.title}</span>
                    <Button variant="text-link" onClick={() => onOpenNote(d.noteId)}>
                      노트 열기
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>이 키워드가 나온 문서가 없습니다.</p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
