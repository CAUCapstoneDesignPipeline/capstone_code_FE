import cytoscape, { type Core } from 'cytoscape'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Graph } from '../../api'
import { nodeColorKey, type TopicColorKey } from '../../lib/topicColors'
import styles from './GraphView.module.css'

interface Props {
  graph: Graph
  colorKeys: ReadonlyMap<string, TopicColorKey>
  selectedId: string | null
  onTapNode: (nodeId: string | null) => void
}

const MAX_FIT_ZOOM = 1.25

/** CSS 토큰을 Cytoscape가 읽는 rgb()/rgba() 값으로 바꾼다 (Cytoscape는 var()와 "rgb(r g b / a)"를 못 읽는다). */
function resolveColor(token: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(--${token})`
  probe.style.display = 'none'
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

/**
 * 전체 그래프 그림 (Cytoscape.js). 노드는 개념, 간선은 관계 (방향 있음).
 * 간선 모양은 design.md: 추출 ink-muted 1px · 확정 ink 3px · 근거 소실 ink-muted 점선(6·4) 1.5px.
 * 같은 노드·간선·색이면 다시 그리지 않는다 (창에 돌아와 다시 받아도 배치가 흔들리지 않게).
 */
export function GraphCanvas({ graph, colorKeys, selectedId, onTapNode }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const onTapRef = useRef(onTapNode)
  useLayoutEffect(() => {
    onTapRef.current = onTapNode
  })

  const nodes = graph.nodes.map((n) => ({ ...n, colorKey: nodeColorKey(n, colorKeys) }))
  const signature = JSON.stringify([
    nodes.map((n) => [n.id, n.label, n.colorKey]),
    graph.edges.map((e) => [e.id, e.sourceId, e.targetId, e.origin, e.status]),
  ])

  useEffect(() => {
    const ink = resolveColor('color-ink')
    const inkMuted = resolveColor('color-ink-muted')
    const canvas = resolveColor('color-canvas')
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
    const colorOf = new Map<string, string>()
    for (const n of nodes) {
      if (!colorOf.has(n.colorKey)) colorOf.set(n.colorKey, resolveColor(`color-${n.colorKey}`))
    }

    const cy = cytoscape({
      container: hostRef.current,
      elements: [
        ...nodes.map((n) => ({
          data: { id: n.id, label: n.label, color: colorOf.get(n.colorKey) ?? inkMuted },
          classes: n.colorKey === 'topic-mixed' ? 'mixed' : undefined,
        })),
        ...graph.edges.map((e) => ({
          data: { id: e.id, source: e.sourceId, target: e.targetId },
          classes: [e.origin, e.status].join(' '),
        })),
      ],
      style: [
        {
          selector: 'node',
          style: {
            width: 14,
            height: 14,
            'background-color': 'data(color)',
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
      ],
      layout: { name: 'cose', animate: false, padding: 32 },
      minZoom: 0.2,
      maxZoom: 3,
    })
    // 노드가 적으면 화면에 맞추느라 크게 확대된다. 글자가 본문보다 커지지 않게 막는다.
    if (cy.zoom() > MAX_FIT_ZOOM) {
      cy.zoom(MAX_FIT_ZOOM)
      cy.center()
    }
    cy.on('tap', 'node', (e) => onTapRef.current(e.target.id()))
    cy.on('tap', (e) => {
      if (e.target === cy) onTapRef.current(null)
    })
    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
    // signature가 같으면 같은 그림이다 (위 설명)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  // 고른 노드 표시 (목록에서 골라도 그림에 보인다)
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes(':selected').unselect()
    if (selectedId) cy.getElementById(selectedId).select()
  }, [selectedId, signature])

  return <div ref={hostRef} className={styles.canvas} role="img" aria-label="전체 개념 그래프" />
}
