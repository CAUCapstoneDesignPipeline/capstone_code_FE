import cytoscape, { type Core, type NodeSingular } from 'cytoscape'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Graph } from '../../api'
import { useTheme, type Theme } from '../../lib/theme'
import { nodeColorKey, TOPIC_SLOTS, type TopicColorKey } from '../../lib/topicColors'
import styles from './GraphView.module.css'

interface Props {
  graph: Graph
  colorKeys: ReadonlyMap<string, TopicColorKey>
  selectedId: string | null
  onTapNode: (nodeId: string | null) => void
}

const MAX_FIT_ZOOM = 1.25
/** 새 노드를 이웃 옆에 둘 때의 거리 */
const NEW_NODE_GAP = 60

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

/** 노드는 data(colorKey)만 갖고, 색은 스타일시트가 테마에 맞춰 칠한다 (테마가 바뀌면 스타일만 다시 넣는다) */
const NODE_COLOR_KEYS: TopicColorKey[] = [
  ...Array.from({ length: TOPIC_SLOTS }, (_, i) => `topic-${i + 1}` as const),
  'topic-other',
  'topic-none',
]

function graphStyle(theme: Theme): cytoscape.StylesheetJson {
  const ink = resolveColor('color-ink', theme)
  const inkMuted = resolveColor('color-ink-muted', theme)
  const canvas = resolveColor('color-canvas', theme)
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
  return [
    {
      selector: 'node',
      style: {
        width: 14,
        height: 14,
        label: 'data(label)',
        color: ink,
        'font-family': font || 'sans-serif',
        'font-size': 12,
        'text-valign': 'bottom',
        'text-margin-y': 4,
        'text-background-color': canvas,
        'text-background-opacity': 0.8,
        'text-background-padding': '1px',
      },
    },
    ...NODE_COLOR_KEYS.map((key) => ({
      selector: `node[colorKey = "${key}"]`,
      style: { 'background-color': resolveColor(`color-${key}`, theme) },
    })),
    // 여러 주제에 걸친 개념: 색 대신 ink 테두리 (색 칸을 쓰지 않는다)
    {
      selector: 'node.mixed',
      style: { 'background-color': canvas, 'border-width': 2, 'border-color': ink },
    },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': ink } },
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': inkMuted,
        'target-arrow-color': inkMuted,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
      },
    },
    {
      selector: 'edge.confirmed',
      style: { width: 3, 'line-color': ink, 'target-arrow-color': ink },
    },
    {
      selector: 'edge.evidence_lost',
      style: {
        width: 1.5,
        'line-color': inkMuted,
        'target-arrow-color': inkMuted,
        'line-style': 'dashed',
        'line-dash-pattern': [6, 4],
      },
    },
  ]
}

/**
 * 전체 그래프 그림 (Cytoscape.js). 노드는 개념, 간선은 관계 (방향 있음).
 * 간선 모양은 design.md: 추출 ink-muted 1px · 확정 ink 3px · 근거 소실 ink-muted 점선(6·4) 1.5px.
 * Cytoscape는 한 번만 만들고 받은 그래프를 맞춰 넣는다. 처음에만 전체 배치를 하고, 이후에는 있던 노드를 그 자리에 두고
 * 새 노드만 이웃 옆에 놓는다 (창에 돌아와 다시 받아도 그림이 흔들리지 않고 확대·이동도 그대로다).
 */
export function GraphCanvas({ graph, colorKeys, selectedId, onTapNode }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const onTapRef = useRef(onTapNode)
  const { theme } = useTheme()
  useLayoutEffect(() => {
    onTapRef.current = onTapNode
  })

  useEffect(() => {
    const cy = cytoscape({
      container: hostRef.current,
      minZoom: 0.2,
      maxZoom: 3,
    })
    cy.on('tap', 'node', (e) => onTapRef.current(e.target.id()))
    cy.on('tap', (e) => {
      if (e.target === cy) onTapRef.current(null)
    })
    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [])

  // 처음 그릴 때와 테마가 바뀔 때 스타일을 넣는다 (노드 색도 스타일시트에 있다)
  useEffect(() => {
    cyRef.current?.style(graphStyle(theme))
  }, [theme])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const firstDraw = cy.elements().empty()
    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    const edgeIds = new Set(graph.edges.map((e) => e.id))
    const added: NodeSingular[] = []

    cy.batch(() => {
      cy.elements()
        .filter((el) => !(el.isNode() ? nodeIds : edgeIds).has(el.id()))
        .remove()
      for (const n of graph.nodes) {
        const key = nodeColorKey(n, colorKeys)
        // 여러 주제는 클래스로 칠한다 (색 토큰이 없다)
        const data = { id: n.id, label: n.label, colorKey: key }
        const classes = key === 'topic-mixed' ? 'mixed' : ''
        const existing = cy.getElementById(n.id)
        if (existing.nonempty()) existing.data(data).classes(classes)
        else added.push(cy.add({ group: 'nodes', data, classes }))
      }
      for (const e of graph.edges) {
        const classes = `${e.origin} ${e.status}`
        const existing = cy.getElementById(e.id)
        if (existing.nonempty()) existing.classes(classes)
        else if (nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)) {
          cy.add({
            group: 'edges',
            data: { id: e.id, source: e.sourceId, target: e.targetId },
            classes,
          })
        }
      }
    })

    if (firstDraw) {
      cy.layout({ name: 'cose', animate: false, padding: 32 }).run()
      // 노드가 적으면 화면에 맞추느라 크게 확대된다. 글자가 본문보다 커지지 않게 막는다.
      if (cy.zoom() > MAX_FIT_ZOOM) {
        cy.zoom(MAX_FIT_ZOOM)
        cy.center()
      }
      return
    }
    // 새 노드: 이미 자리가 있는 이웃 옆에, 이웃이 없으면 지금 보이는 화면 가운데에
    const unplaced = new Set(added.map((n) => n.id()))
    const extent = cy.extent()
    added.forEach((node, i) => {
      const anchor = node
        .neighborhood()
        .nodes()
        .filter((m) => !unplaced.has(m.id()))[0] as NodeSingular | undefined
      const center = anchor
        ? anchor.position()
        : { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 }
      const angle = (i * 2 * Math.PI) / Math.max(added.length, 6)
      node.position({
        x: center.x + NEW_NODE_GAP * Math.cos(angle),
        y: center.y + NEW_NODE_GAP * Math.sin(angle),
      })
      unplaced.delete(node.id())
    })
  }, [graph, colorKeys])

  // 고른 노드 표시 (목록에서 골라도 그림에 보인다)
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes(':selected').unselect()
    if (selectedId) cy.getElementById(selectedId).select()
  }, [selectedId, graph])

  return <div ref={hostRef} className={styles.canvas} role="img" aria-label="전체 개념 그래프" />
}
