import cytoscape, { type Core } from 'cytoscape'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { useTheme, type Theme } from '../../lib/theme'
import { TOPIC_SLOTS, type TopicColorKey } from '../../lib/topicColors'
import { circleImage, resolveColor, splitAlpha } from './cytoscapeShared'
import { renderedToModel, zoomStep, type GalaxyElements, type Point } from './galaxy'
import { GalaxyZoomGate, zoomLimits } from './galaxyZoom'
import styles from './GraphView.module.css'

export interface GalaxyCanvasHandle {
  /** 화면 가운데를 기준으로 확대(>1)·축소(<1). 줌으로 단계를 바꾸는 규칙을 그대로 따른다 */
  zoomBy: (factor: number) => void
}

interface Props {
  /** 지금 단계 (경로 id를 이은 값). 바뀌면 화면 전체를 새로 그린다 */
  levelKey: string
  /** 그릴 요소. 아직 받는 중이면 null (빈 화면) */
  elements: GalaxyElements | null
  /** 최상위가 아니라 위로 갈 수 있는지 */
  canGoUp: boolean
  onEnterTopic: (topicId: string) => void
  onUp: () => void
  onTapKeyword: (keywordId: string) => void
  /** 팝업이 열린 키워드. 없으면 null */
  selectedKeyword: string | null
  /** 빈 곳을 눌렀다. 위로 갈지(팝업을 닫을지)는 부른 쪽이 정한다 */
  onTapBackground: () => void
  ref?: Ref<GalaxyCanvasHandle>
}

/** 단계에 들어와 화면에 맞출 때 이보다 크게 확대하지 않는다 (노드가 적을 때 글자가 너무 커지지 않게) */
const MAX_FIT_ZOOM = 1.2
const FIT_PADDING = 60
const TOPIC_FONT_SIZE = 13
const KEYWORD_FONT_SIZE = 12
/** 안에 추천 지식이 있는 주제의 점 (W3-22d RecommendMark 12) */
const MARK = 12
/** − + 버튼 한 번에 바꾸는 배율 */
export const GALAXY_BUTTON_ZOOM = 1.4

const COLOR_KEYS: TopicColorKey[] = [
  ...Array.from({ length: TOPIC_SLOTS }, (_, i) => `topic-${i + 1}` as const),
  'topic-other',
  'topic-none',
]

function galaxyStyle(theme: Theme): cytoscape.StylesheetJson {
  const ink = resolveColor('color-ink', theme)
  const muted = splitAlpha(resolveColor('color-ink-muted', theme))
  const recommended = resolveColor('color-recommended', theme)
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
  return [
    // 주제 (W3-22d·e 큰 원): 주제 색 옅은 바탕 + 주제 색 테두리, 이름과 "하위 주제 N · 키워드 N" 두 줄
    {
      selector: 'node.topic',
      style: {
        shape: 'ellipse',
        width: 'data(size)',
        height: 'data(size)',
        'background-opacity': 0.16,
        'border-width': 1.5,
        label: 'data(label)',
        color: ink,
        'font-family': font || 'sans-serif',
        'font-size': TOPIC_FONT_SIZE,
        'font-weight': 500,
        'text-wrap': 'wrap',
        'text-max-width': 'data(size)',
        'text-valign': 'center',
        'text-halign': 'center',
        'line-height': 1.4,
      },
    },
    // 안에 추천 지식이 있는 주제: 오른쪽 위에 작은 점
    {
      selector: 'node.topic.has-recommended',
      style: {
        'background-image': circleImage(recommended, MARK),
        'background-width': MARK,
        'background-height': MARK,
        'background-fit': 'none',
        'background-clip': 'none',
        'background-image-containment': 'over',
        'background-image-opacity': 1,
        'background-position-x': '85%',
        'background-position-y': '12%',
      },
    },
    // 키워드 (작은 점): 주제 색, 이름은 아래
    {
      selector: 'node.keyword',
      style: {
        shape: 'ellipse',
        width: 'data(size)',
        height: 'data(size)',
        'border-width': 0,
        label: 'data(label)',
        color: ink,
        'font-family': font || 'sans-serif',
        'font-size': KEYWORD_FONT_SIZE,
        'font-weight': 500,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 4,
      },
    },
    ...COLOR_KEYS.map((key) => {
      const color = resolveColor(`color-${key}`, theme)
      return {
        selector: `node[colorKey = "${key}"]`,
        style: { 'background-color': color, 'border-color': color },
      }
    }),
    // 추천으로 들어온 지식 (◆ + recommended 색). 주제 색보다 뒤에 두어 덮는다
    {
      selector: 'node.keyword.recommended',
      style: {
        shape: 'diamond',
        'background-color': recommended,
        'border-width': 1.5,
        'border-color': ink,
        color: recommended,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': muted.color,
        'line-opacity': muted.opacity,
        'curve-style': 'straight',
      },
    },
    // 누른 키워드 (팝업이 열린 키워드)
    {
      selector: 'node.keyword.selected',
      style: { 'border-width': 2, 'border-color': ink },
    },
  ]
}

/**
 * Galaxy 그래프 그림 (Figma W3-22d·e, Cytoscape.js + fcose). 한 번에 한 단계만 그린다.
 * - 단계가 바뀌면 요소를 모두 바꾸고 한 번만 배치한 뒤 화면에 맞춘다. 그 단계 안에서는 줌·이동해도 다시 배치하지 않는다(노드도 끌 수 없다).
 * - 화면에 맞춘 배율의 GALAXY_LEVEL_ZOOM배로 확대하면 마우스 아래(− + 버튼이면 화면 가운데) 주제로 들어가고,
 *   그 분의 1로 축소하면 위로 간다. 그 자리에 주제가 없으면 들어가지 않고 계속 확대한다 (zoomStep).
 */
export function GalaxyCanvas(props: Props) {
  const { levelKey, elements, selectedKeyword, ref } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const { theme } = useTheme()
  const latest = useRef(props)
  useLayoutEffect(() => {
    latest.current = props
  })
  /** 줌으로 단계를 바꿀지 판단할 때 (galaxyZoom.ts) */
  const [gate] = useState(() => new GalaxyZoomGate())
  const drawnLevel = useRef<string | null>(null)

  useImperativeHandle(ref, () => ({
    zoomBy: (factor) => {
      const cy = cyRef.current
      if (!cy) return
      // 버튼은 화면 가운데 기준 (휠의 마우스 위치를 잊는다)
      gate.forgetWheel()
      cy.zoom({
        level: cy.zoom() * factor,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      })
    },
  }))

  useEffect(() => {
    const cy = cytoscape({
      container: hostRef.current,
      minZoom: 0.05,
      maxZoom: 8,
      autoungrabify: true,
      autounselectify: true,
      boxSelectionEnabled: false,
    })
    cy.on('tap', 'node.topic', (e) => {
      if (gate.startMoving()) latest.current.onEnterTopic(e.target.id())
    })
    cy.on('tap', 'node.keyword', (e) => latest.current.onTapKeyword(e.target.id()))
    cy.on('tap', (e) => {
      if (e.target === cy && !gate.isMoving()) latest.current.onTapBackground()
    })
    cy.on('zoom', () => {
      const zoom = cy.zoom()
      const step = gate.onZoom(zoom, (baseZoom) => {
        // 최근 휠이면 그 마우스 위치, 아니면(− + 버튼·핀치) 화면 가운데에 있는 주제로 들어간다
        const rendered = gate.origin({ x: cy.width() / 2, y: cy.height() / 2 })
        return zoomStep({
          zoom,
          baseZoom,
          point: renderedToModel(rendered, cy.pan(), zoom),
          topics: cy.nodes('node.topic').map((n) => ({
            id: n.id(),
            circle: { ...n.position(), r: n.width() / 2 },
          })),
          canGoUp: latest.current.canGoUp,
        })
      })
      if (step?.kind === 'enter') latest.current.onEnterTopic(step.topicId)
      else if (step?.kind === 'up') latest.current.onUp()
    })
    // 휠로 줌할 때의 마우스 위치 (컨테이너 기준 화면 좌표). Cytoscape는 이 점을 고정점으로 확대한다
    const host = hostRef.current
    const onWheel = (e: WheelEvent) => {
      const rect = host?.getBoundingClientRect()
      if (rect) gate.wheelAt({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    host?.addEventListener('wheel', onWheel, { passive: true, capture: true })
    cyRef.current = cy
    const resizeObserver = new ResizeObserver(() => cy.resize())
    if (host) resizeObserver.observe(host)
    return () => {
      host?.removeEventListener('wheel', onWheel, { capture: true })
      resizeObserver.disconnect()
      cy.destroy()
      cyRef.current = null
    }
  }, [gate])

  useEffect(() => {
    cyRef.current?.style(galaxyStyle(theme))
  }, [theme])

  // 단계가 바뀌면 화면 전체를 바꾼다. 같은 단계를 다시 받았으면(분석 완료·이해함 뒤) 단계는 그대로 두고:
  // 노드가 같으면 자리도 그대로 내용만 바꾸고, 노드가 늘거나 줄었으면 남은 노드 자리에서 다시 배치한다.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const newLevel = drawnLevel.current !== levelKey
    if (newLevel) {
      // 새 단계를 받기 전에는 줌으로 단계를 바꾸지 않는다
      gate.levelChanged()
      cy.elements().remove()
      drawnLevel.current = null
    }
    if (!elements) return
    const sameIds =
      !newLevel &&
      cy.nodes().length === elements.nodes.length &&
      elements.nodes.every((n) => cy.getElementById(n.data.id).nonempty())
    if (sameIds) {
      cy.batch(() => {
        for (const n of elements.nodes) {
          const node = cy.getElementById(n.data.id)
          node.data(n.data)
          node.classes(n.classes)
        }
        cy.edges().remove()
        cy.add(elements.edges.map((e) => ({ group: 'edges' as const, data: e.data })))
      })
      return
    }

    // 배치·화면 맞추기가 내는 줌 이벤트로 단계가 바뀌지 않게 판단을 멈춘다
    gate.pause()
    // 같은 단계를 다시 받았으면 남은 노드는 그 자리에서 시작한다
    const kept = new Map<string, Point>()
    if (!newLevel) cy.nodes().forEach((n) => void kept.set(n.id(), { ...n.position() }))
    cy.elements().remove()
    cy.add([
      ...elements.nodes.map((n) => ({ group: 'nodes' as const, data: n.data, classes: n.classes })),
      ...elements.edges.map((e) => ({ group: 'edges' as const, data: e.data })),
    ])
    drawnLevel.current = levelKey
    // 시작 위치: 주제는 안쪽 원, 키워드는 바깥 원에 순서대로 (같은 데이터면 같은 그림). 남은 노드는 원래 자리
    const topics = cy.nodes('.topic')
    const keywords = cy.nodes('.keyword')
    const place = (list: cytoscape.NodeCollection, radius: number) =>
      list.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / Math.max(list.length, 1) - Math.PI / 2
        n.position(kept.get(n.id()) ?? { x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
      })
    place(topics, 120 + topics.length * 30)
    place(keywords, 260 + keywords.length * 12)
    if (cy.nodes().length > 1) {
      cy.layout({
        name: 'fcose',
        randomize: false,
        animate: false,
        fit: false,
        quality: 'default',
        nodeDimensionsIncludeLabels: true,
        nodeRepulsion: 12000,
        idealEdgeLength: 160,
      } as cytoscape.LayoutOptions).run()
    }
    // 맞추기 전에 줌 한계를 풀고, 맞춘 배율에 맞춰 다시 정한다 (축소 한계 < 위로 가는 기준)
    cy.minZoom(1e-4)
    cy.maxZoom(1e4)
    cy.fit(undefined, FIT_PADDING)
    if (cy.zoom() > MAX_FIT_ZOOM) {
      cy.zoom(MAX_FIT_ZOOM)
      cy.center()
    }
    const fitZoom = cy.zoom()
    const limits = zoomLimits(fitZoom)
    cy.minZoom(limits.min)
    cy.maxZoom(limits.max)
    gate.drawn(fitZoom, newLevel)
  }, [levelKey, elements, gate])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.nodes('.selected').removeClass('selected')
      if (selectedKeyword) cy.getElementById(selectedKeyword).addClass('selected')
    })
  }, [selectedKeyword, elements])

  return <div ref={hostRef} className={styles.canvas} role="img" aria-label="Galaxy 그래프" />
}
