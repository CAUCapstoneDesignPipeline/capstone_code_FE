import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GraphSearchResult, TopicGraph } from '../../api'
import { Button } from '../../components/Button'
import { useToast } from '../../components/toastContext'
import { keys, prefetchTopicGraph, useTopicGraph } from '../../data/queries'
import { useAuth } from '../auth/authContext'
import type { TopicColorKey } from '../../lib/topicColors'
import { GalaxyCanvas, GALAXY_BUTTON_ZOOM, type GalaxyCanvasHandle } from './GalaxyCanvas'
import {
  currentTopicId,
  enter,
  galaxyElements,
  goTo,
  isRecommendedKeyword,
  levelKeyOf,
  levelSummary,
  refreshPathNames,
  searchTargetPath,
  up,
  type GalaxyPath,
} from './galaxy'
import { prefersReducedMotion, runGalaxyRoute } from './galaxyNavigate'
import { GalaxySearch } from './GalaxySearch'
import { GALAXY_TOPIC_GONE_TOAST, pathAfterLevelError, useGalaxyPath } from './galaxyPath'
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

/**
 * Galaxy 그래프 화면 (FE #44 1단계, Figma W3-22d·e). 주제(폴더) 단계를 재귀적으로 들어간다.
 * 처음은 최상위 주제만(노드 크기 = 키워드 수, 선 = 주제 사이 관련). 주제를 누르거나 줌 인하면 그 주제 안
 * (하위 주제 + 바로 속한 키워드), 빈 곳을 누르거나 줌 아웃하면 한 단계 위. 위의 경로를 누르면 그 단계로.
 * 키워드를 누르면 그 키워드가 나온 문서 목록(W3-20d)을 보이고, 문서를 누르면 노트를 연다.
 * 보던 단계는 사용자별로 기억한다(galaxyPath.ts). 보던 주제가 없어졌으면(404) 전체로 돌아가 알린다.
 * 왼쪽 위 검색(W3-22g)으로 주제·키워드를 고르면 그 단계까지 한 단계씩 확대하며 간다(galaxyNavigate.ts).
 * 가는 동안은 줌·클릭·경로·− +로 단계를 바꾸지 않는다.
 * 2D/3D 토글(상단 막대 오른쪽)은 다음 PR이다.
 */
export function GalaxyView({ root, colorKeys, onOpenNote }: Props) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [storedPath, storePath] = useGalaxyPath(user.id)
  // 경로의 이름은 받은 데이터 기준 (다른 곳에서 주제 이름을 바꿨을 때). 단계는 id로만 정한다
  const path = refreshPathNames(storedPath, (id) =>
    id === null ? root : qc.getQueryData<TopicGraph>(keys.topicGraph(id)),
  )
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null)
  const setPath = (next: GalaxyPath) => {
    storePath(next)
    setSelectedKeyword(null)
  }
  const canvasRef = useRef<GalaxyCanvasHandle>(null)
  /** 검색 결과로 가는 중 */
  const [navigating, setNavigating] = useState(false)
  const navigation = useRef<AbortController | null>(null)
  /** 검색으로 가기 시작할 때의 경로 (비동기 처리 안에서 읽는다) */
  const pathRef = useRef(path)
  useEffect(() => {
    pathRef.current = path
  })
  // 화면을 떠나면 가던 것을 그만둔다
  useEffect(() => () => navigation.current?.abort(), [])

  const topicId = currentTopicId(path)
  // 최상위는 GraphView가 받아 둔 것을 쓴다
  const level = useTopicGraph(topicId, topicId !== null)
  const graph = topicId === null ? root : level.data
  const elements = useMemo(
    () => (graph ? galaxyElements(graph, path, colorKeys) : null),
    [graph, path, colorKeys],
  )
  const levelKey = levelKeyOf(path)
  const keyword = elements?.keywords.find((k) => k.id === selectedKeyword) ?? null
  const keywordCount = elements?.keywords.length ?? 0
  // 미분류 노드(최상위)도 노드로 센다
  const topicNodes = elements?.topics ?? []
  const empty = elements !== null && topicNodes.length === 0 && keywordCount === 0

  // 이름이 바뀐 경로는 기억해 둔다 (다음에 돌아올 때도 새 이름)
  useEffect(() => {
    if (path !== storedPath) storePath(path)
  }, [path, storedPath, storePath])

  // 보던 주제가 없어졌으면(404) 전체로 돌아가 알린다. 그 밖의 오류는 오류 안내에서 다시 시도한다
  const levelError = topicId !== null ? level.error : null
  useEffect(() => {
    if (!levelError) return
    const next = pathAfterLevelError(levelError)
    if (!next) return
    storePath(next)
    toast('info', GALAXY_TOPIC_GONE_TOAST)
  }, [levelError, storePath, toast])

  /** 검색 결과로 간다. 가는 중에 다른 결과를 고르면 앞의 것을 그만두고 지금 자리에서 다시 간다 */
  async function goToResult(result: GraphSearchResult) {
    navigation.current?.abort()
    const controller = new AbortController()
    navigation.current = controller
    setSelectedKeyword(null)
    setNavigating(true)
    try {
      const outcome = await runGalaxyRoute(
        pathRef.current,
        {
          path: searchTargetPath(result),
          keywordId: result.kind === 'keyword' ? result.id : null,
        },
        {
          setPath,
          prefetch: (id) => prefetchTopicGraph(qc, id),
          zoomInto: (id, signal) => canvasRef.current?.zoomInto(id, signal) ?? Promise.resolve(),
          whenDrawn: (p, signal) =>
            canvasRef.current?.whenDrawn(levelKeyOf(p), signal) ?? Promise.resolve(),
          focusKeyword: (id, signal) =>
            canvasRef.current?.focusKeyword(id, signal) ?? Promise.resolve(),
          openKeyword: setSelectedKeyword,
          reducedMotion: prefersReducedMotion(),
        },
        controller.signal,
      )
      if (outcome === 'gone') toast('info', GALAXY_TOPIC_GONE_TOAST)
    } finally {
      if (navigation.current === controller) {
        navigation.current = null
        setNavigating(false)
      }
    }
  }

  /** 이 단계의 주제로 들어간다 */
  function enterTopic(id: string) {
    const t = topicNodes.find((x) => x.id === id)
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
        <button
          type="button"
          className={styles.crumb}
          disabled={navigating}
          onClick={() => setPath(goTo(path, -1))}
        >
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
            <button
              type="button"
              className={styles.crumb}
              disabled={navigating}
              onClick={() => setPath(goTo(path, i))}
            >
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
          locked={navigating}
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

        {/* W3-22g Graph/Search: 그래프 왼쪽 위 */}
        <GalaxySearch onSelect={(r) => void goToResult(r)} />

        {/* W3-22d·e ZoomIndicator: − 축소 · 경로 · + 확대. 줌으로 단계를 바꾸는 규칙을 그대로 따른다 */}
        <div className={styles.zoomBar}>
          <button
            type="button"
            className={styles.zoomButton}
            aria-label="축소"
            disabled={navigating}
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
            disabled={navigating}
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
