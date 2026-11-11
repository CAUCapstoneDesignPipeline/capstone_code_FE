import cytoscape, { type Core, type NodeSingular } from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Graph } from '../../api'
import { useTheme, type Theme } from '../../lib/theme'
import { nodeColorKey, TOPIC_SLOTS, type TopicColorKey } from '../../lib/topicColors'
import styles from './GraphView.module.css'
import { edgeKey, edgeLabel, initialPositions, placeNear, sortedById, type Box } from './pageGraph'

cytoscape.use(fcose)

interface Props {
  graph: Graph
  colorKeys: ReadonlyMap<string, TopicColorKey>
  /** 고른 선 (edgeKey). 없으면 null */
  selectedEdge: string | null
  onTapNode: (noteId: string) => void
  /** 선을 누르면 그 선, 빈 곳을 누르면 null */
  onTapEdge: (key: string | null) => void
}

const MAX_FIT_ZOOM = 1
/** 새 페이지를 이웃 옆에 둘 때의 거리 */
const NEW_NODE_GAP = 80
const NODE_HEIGHT = 30
const NODE_FONT_SIZE = 13
/** 선 라벨(공유 키워드) 글자 크기 */
const EDGE_FONT_SIZE = 11
/** 페이지 알약: 왼쪽 여백 12 + 점 8 + 간격 8 + 글자 + 오른쪽 여백 12 */
const NODE_CHROME = 40
const DOT = 8

const resolved = new Map<string, string>()
let probe: HTMLSpanElement | null = null

/**
 * CSS 토큰을 Cytoscape가 읽는 rgb()/rgba() 값으로 바꾼다 (Cytoscape는 var()와 "rgb(r g b / a)"를 못 읽는다).
 * 토큰 값은 테마에 따라서만 바뀌므로 테마별로 한 번 읽은 값을 계속 쓴다. theme은 지금 <html data-theme>과 같아야 한다.
 */
function resolveColor(token: string, theme: Theme): string {
  const key = `${theme}:${token}`
  const cached = resolved.get(key)
  if (cached) return cached
  if (!probe) {
    probe = document.createElement('span')
    probe.style.display = 'none'
    document.body.append(probe)
  }
  probe.style.color = `var(--${token})`
  const color = getComputedStyle(probe).color
  resolved.set(key, color)
  return color
}

/**
 * Cytoscape는 rgba()의 투명도를 색에 반영하지 않는다. 색과 투명도를 나눠 *-opacity 속성으로 준다.
 * "rgba(38, 37, 30, 0.2)" → { color: "rgb(38, 37, 30)", opacity: 0.2 }
 */
function splitAlpha(color: string): { color: string; opacity: number } {
  const m = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/)
  return m
    ? { color: `rgb(${m[1]}, ${m[2]}, ${m[3]})`, opacity: Number(m[4]) }
    : { color, opacity: 1 }
}

let measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string, size: number): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * size * 0.6
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
  measureCtx.font = `400 ${size}px ${font || 'sans-serif'}`
  return measureCtx.measureText(text).width
}

/** 주제 색 점 (W3-13: 점 색 = 주제 색). 테마가 바뀌면 다시 만든다. */
function dotImage(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${DOT}" height="${DOT}"><circle cx="${DOT / 2}" cy="${DOT / 2}" r="${DOT / 2}" fill="${color}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const COLOR_KEYS: TopicColorKey[] = [
  ...Array.from({ length: TOPIC_SLOTS }, (_, i) => `topic-${i + 1}` as const),
  'topic-other',
  'topic-none',
]

function graphStyle(theme: Theme): cytoscape.StylesheetJson {
  const ink = resolveColor('color-ink', theme)
  const canvas = resolveColor('color-canvas', theme)
  const ghost = splitAlpha(resolveColor('color-border-ghost', theme))
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
  const dotStyle = {
    'background-width': DOT,
    'background-height': DOT,
    'background-fit': 'none',
    'background-clip': 'none',
    'background-image-containment': 'over',
    'background-position-y': '50%',
  } as const
  return [
    // 페이지: 알약 + 주제 색 점 + 제목
    {
      selector: 'node.page',
      style: {
        shape: 'round-rectangle',
        'corner-radius': `${NODE_HEIGHT / 2}px`,
        width: 'data(width)',
        height: NODE_HEIGHT,
        'background-color': canvas,
        'border-width': 1,
        'border-color': ghost.color,
        'border-opacity': ghost.opacity,
        label: 'data(label)',
        color: ink,
        'font-family': font || 'sans-serif',
        'font-size': NODE_FONT_SIZE,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-margin-x': (DOT + 8) / 2,
        ...dotStyle,
        'background-position-x': 12,
      },
    },
    ...COLOR_KEYS.map((key) => ({
      selector: `node[colorKey = "${key}"]`,
      style: { 'background-image': dotImage(resolveColor(`color-${key}`, theme)) },
    })),
    // 고른 선의 두 끝 페이지 (W3-13b)
    {
      selector: 'node.page.endpoint',
      style: { 'border-width': 2, 'border-color': ink, 'border-opacity': 1 },
    },
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': ghost.color,
        'line-opacity': ghost.opacity,
        'curve-style': 'straight',
        // 1px 선도 누르기 쉽게 (눌리는 범위만 넓힌다, 겹침 표시는 보이지 않게)
        'overlay-padding': '6px',
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'edge.selected',
      style: { width: 2, 'line-color': ink, 'line-opacity': 1, 'z-index': 10 },
    },
    // 마우스를 올리거나 고른 선: 공유 키워드를 선 위에 보인다 (sharedKeywords, 없으면 라벨 없음)
    {
      selector: 'edge.hover, edge.selected',
      style: {
        label: 'data(label)',
        color: ink,
        'font-family': font || 'sans-serif',
        'font-size': EDGE_FONT_SIZE,
        'text-background-color': canvas,
        'text-background-opacity': 1,
        'text-background-padding': '2px',
        'text-rotation': 'autorotate',
        'z-index': 10,
      },
    },
    {
      selector: 'edge.hover',
      style: { 'line-color': ink, 'line-opacity': 1 },
    },
  ]
}

/**
 * 페이지 그래프 그림 (Figma W3-13, Cytoscape.js + fcose). 노드는 페이지, 선은 같은 키워드를 공유하는 두 페이지 (방향 없음).
 * 주제(폴더)로 묶지 않고 모든 페이지를 한 판에 둔다. 주제는 노드 점 색과 범례로만 나타낸다.
 * 처음에는 id로 정한 시작 위치에서 fcose로 배치해 같은 그래프면 열 때마다 같은 그림이다. 이후 다시 받으면 있던 페이지는 그 자리에 두고 새 페이지만 이웃 옆에 놓는다.
 */
export function GraphCanvas(props: Props) {
  const { graph, colorKeys, selectedEdge } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const handlers = useRef({ onTapNode: props.onTapNode, onTapEdge: props.onTapEdge })
  const { theme } = useTheme()
  useLayoutEffect(() => {
    handlers.current = { onTapNode: props.onTapNode, onTapEdge: props.onTapEdge }
  })

  useEffect(() => {
    const cy = cytoscape({
      container: hostRef.current,
      minZoom: 0.2,
      maxZoom: 3,
      autounselectify: true,
    })
    cy.on('tap', 'node.page', (e) => handlers.current.onTapNode(e.target.id()))
    cy.on('tap', 'edge', (e) => handlers.current.onTapEdge(e.target.id()))
    // 선에 마우스를 올리면 공유 키워드를 보인다
    cy.on('mouseover', 'edge', (e) => {
      e.target.addClass('hover')
    })
    cy.on('mouseout', 'edge', (e) => {
      e.target.removeClass('hover')
    })
    cy.on('tap', (e) => {
      if (e.target === cy) handlers.current.onTapEdge(null)
    })
    cyRef.current = cy
    // Cytoscape는 창 크기만 지켜본다. 사이드바를 접고 펴서 칸만 커지거나 줄어도 다시 잰다.
    const host = hostRef.current
    const resizeObserver = new ResizeObserver(() => cy.resize())
    if (host) resizeObserver.observe(host)
    return () => {
      resizeObserver.disconnect()
      cy.destroy()
      cyRef.current = null
    }
  }, [])

  // 처음 그릴 때와 테마가 바뀔 때 스타일을 넣는다 (점 색도 스타일시트에 있다)
  useEffect(() => {
    cyRef.current?.style(graphStyle(theme))
  }, [theme])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const firstDraw = cy.elements().empty()
    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    const edgeIds = new Set(graph.edges.map(edgeKey))
    const added: NodeSingular[] = []

    cy.batch(() => {
      cy.edges()
        .filter((e) => !edgeIds.has(e.id()))
        .remove()
      cy.nodes('.page')
        .filter((n) => !nodeIds.has(n.id()))
        .remove()
      // id 순으로 넣는다. 응답의 노드·선 순서가 달라도 fcose에 같은 순서로 들어가 같은 그림이 나온다.
      for (const n of sortedById(graph.nodes, (node) => node.id)) {
        const data = {
          id: n.id,
          label: n.title,
          colorKey: nodeColorKey(n, colorKeys),
          width: textWidth(n.title, NODE_FONT_SIZE) + NODE_CHROME,
        }
        const existing = cy.getElementById(n.id)
        // 다른 주제로 옮긴 페이지는 자리는 그대로, 점 색(colorKey)만 바뀐다
        if (existing.nonempty()) existing.data(data)
        else added.push(cy.add({ group: 'nodes', data, classes: 'page' }))
      }
      for (const e of sortedById(graph.edges, edgeKey)) {
        const id = edgeKey(e)
        const label = edgeLabel(e.sharedKeywords)
        const existing = cy.getElementById(id)
        // 있던 선은 공유 키워드만 바뀔 수 있다
        if (existing.nonempty()) existing.data('label', label)
        else if (nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)) {
          cy.add({ group: 'edges', data: { id, source: e.sourceId, target: e.targetId, label } })
        }
      }
    })

    if (firstDraw) {
      const start = initialPositions(graph.nodes)
      cy.nodes('.page').forEach((n) => {
        const p = start.get(n.id())
        if (p) n.position(p)
      })
      cy.layout({
        name: 'fcose',
        randomize: false,
        animate: false,
        quality: 'default',
        packComponents: false,
        nodeRepulsion: 6000,
        idealEdgeLength: 100,
        padding: 40,
      } as cytoscape.LayoutOptions).run()
      // 페이지가 적으면 화면에 맞추느라 크게 확대된다. 글자가 본문보다 커지지 않게 막는다.
      if (cy.zoom() > MAX_FIT_ZOOM) {
        cy.zoom(MAX_FIT_ZOOM)
        cy.center()
      }
      return
    }
    // 새 페이지: 이미 자리가 있는 이웃 옆에, 이웃이 없으면 화면 가운데. 다른 페이지와 겹치면 빈자리를 찾는다.
    const unplaced = new Set(added.map((n) => n.id()))
    const extent = cy.extent()
    const boxOf = (n: NodeSingular): Box => ({
      ...n.position(),
      width: n.data('width') as number,
      height: NODE_HEIGHT,
    })
    const taken = cy
      .nodes('.page')
      .filter((n) => !unplaced.has(n.id()))
      // '.page' 셀렉터로 고른 노드뿐이다
      .map((n) => boxOf(n as NodeSingular))
    added.forEach((node, i) => {
      const anchor = node.neighborhood('node.page').filter((m) => !unplaced.has(m.id()))[0] as
        NodeSingular | undefined
      const center = anchor
        ? anchor.position()
        : { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 }
      const angle = (i * 2 * Math.PI) / Math.max(added.length, 6)
      const size = { width: node.data('width') as number, height: NODE_HEIGHT }
      node.position(placeNear(center, angle, size, taken, NEW_NODE_GAP))
      taken.push(boxOf(node))
      unplaced.delete(node.id())
    })
  }, [graph, colorKeys])

  // 고른 선과 두 끝 페이지 표시 (W3-13b)
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.elements('.selected, .endpoint').removeClass('selected endpoint')
      if (!selectedEdge) return
      const edge = cy.getElementById(selectedEdge)
      edge.addClass('selected')
      edge.connectedNodes().addClass('endpoint')
    })
  }, [selectedEdge, graph])

  return <div ref={hostRef} className={styles.canvas} role="img" aria-label="페이지 그래프" />
}
