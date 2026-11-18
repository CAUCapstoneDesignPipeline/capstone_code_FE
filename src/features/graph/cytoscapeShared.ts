// 페이지 그래프(GraphCanvas)와 Galaxy 그래프(GalaxyCanvas)가 함께 쓰는 Cytoscape 준비: fcose 배치 등록, CSS 토큰·글꼴 읽기.
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import type { Theme } from '../../lib/theme'

// 두 그래프가 같은 배치를 쓴다. 이 모듈을 불러오면 한 번만 등록된다
cytoscape.use(fcose)

const resolved = new Map<string, string>()
let probe: HTMLSpanElement | null = null

/**
 * CSS 토큰을 Cytoscape가 읽는 rgb()/rgba() 값으로 바꾼다 (Cytoscape는 var()와 "rgb(r g b / a)"를 못 읽는다).
 * 토큰 값은 테마에 따라서만 바뀌므로 테마별로 한 번 읽은 값을 계속 쓴다. theme은 지금 <html data-theme>과 같아야 한다.
 */
export function resolveColor(token: string, theme: Theme): string {
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
export function splitAlpha(color: string): { color: string; opacity: number } {
  const m = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/)
  return m
    ? { color: `rgb(${m[1]}, ${m[2]}, ${m[3]})`, opacity: Number(m[4]) }
    : { color, opacity: 1 }
}

let measureCtx: CanvasRenderingContext2D | null = null
export function textWidth(text: string, size: number): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * size * 0.6
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
  measureCtx.font = `400 ${size}px ${font || 'sans-serif'}`
  return measureCtx.measureText(text).width
}

/** 지름 size의 색 원 그림 (노드 배경 그림으로 쓴다: 페이지 점, Galaxy의 추천 지식 점). 테마가 바뀌면 다시 만든다 */
export function circleImage(color: string, size: number): string {
  const r = size / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="${color}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
