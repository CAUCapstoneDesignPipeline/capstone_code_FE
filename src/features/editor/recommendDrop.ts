// 추천 카드를 본문의 블록 사이에 놓기 (Issue #43, Figma W3-22b·c)
// - 놓을 수 있는 자리는 맨 위 블록(문단·제목·목록·표·코드·인용 등) 사이뿐이다. 목록·표 안이나 문장 중간에는 놓지 않는다.
// - 끄는 동안(또는 키보드로 고르는 동안) 그 자리에 "여기에 넣기" 선을 본문 위에 겹쳐 그린다. 본문은 밀리지 않는다.
// - 넣는 변경에는 insertedRecommendation 표시를 붙인다. 편집기는 이 변경을 입력으로 치지 않는다 (분석 트리거 제외).
import { ensureSyntaxTree } from '@codemirror/language'
import {
  Annotation,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Transaction,
} from '@codemirror/state'
import { EditorView, layer, type LayerMarker } from '@codemirror/view'

/** 추천 카드를 끌 때 쓰는 형식. 앱 안에서 끈 카드만 받는다 (내용은 추천 id) */
export const RECOMMENDATION_DRAG_TYPE = 'application/x-capstone-recommendation'

/** 추천 카드를 넣은 변경. 사용자의 입력이 아니다 */
export const insertedRecommendation = Annotation.define<true>()

/** 이 변경들 중 추천 카드를 넣은 것이 있는지 */
export function isInsertedRecommendation(transactions: readonly Transaction[]): boolean {
  return transactions.some((tr) => tr.annotation(insertedRecommendation) === true)
}

/**
 * 본문 변경을 알린다. 사용자의 입력이면 저장과 추천(분석) 트리거에 함께 알리고(input),
 * 추천 카드를 넣은 변경이면 저장에만 알린다(save). 넣기는 분석 트리거로 치지 않는다 (Issue #43).
 */
export function routeBodyChange(
  body: string,
  inserted: boolean,
  handlers: { input: (body: string) => void; save: (body: string) => void },
) {
  if (inserted) handlers.save(body)
  else handlers.input(body)
}

/**
 * 블록 사이 자리(문서 위치) 목록. 맨 위 블록마다 그 블록이 시작하는 줄의 처음, 그리고 문서 끝.
 * 빈 문서면 [0]. 오름차순이고 겹치지 않는다.
 */
export function blockBoundaries(state: EditorState): number[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 500)
  const out: number[] = []
  const push = (pos: number) => {
    if (out[out.length - 1] !== pos) out.push(pos)
  }
  for (let node = tree?.topNode.firstChild ?? null; node; node = node.nextSibling) {
    push(state.doc.lineAt(node.from).from)
  }
  push(state.doc.length)
  return out
}

/** 자리 앞 블록의 첫 줄 (키보드로 고를 때 화면 읽기 프로그램에 알린다). 맨 앞이면 null */
export function blockBefore(state: EditorState, pos: number): string | null {
  const boundaries = blockBoundaries(state)
  const i = boundaries.indexOf(pos)
  if (i <= 0) return null
  const from = boundaries[i - 1]
  return (
    state.doc
      .lineAt(from)
      .text.replace(/^[\s>#*\-+\d.[\]x]+/i, '')
      .trim() || null
  )
}

/** "여기에 넣기" 선을 보일 자리. null이면 지운다 */
export const setInsertIndicator = StateEffect.define<number | null>()

const indicatorField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setInsertIndicator)) return e.value
    if (value === null || !tr.docChanged) return value
    return tr.changes.mapPos(value)
  },
})

/** 문서 위치 pos인 자리의 세로 위치 (문서 기준). 앞 블록 아래와 뒤 블록 위의 가운데 */
function boundaryTop(view: EditorView, pos: number): number {
  const len = view.state.doc.length
  if (pos >= len) return view.lineBlockAt(len).bottom
  const next = view.lineBlockAt(pos).top
  if (pos === 0) return next
  const prev = view.lineBlockAt(pos - 1).bottom
  return (prev + next) / 2
}

/** 화면 좌표 y에 가장 가까운 자리 */
export function nearestBoundary(view: EditorView, clientY: number): number {
  const y = clientY - view.documentTop
  let best = 0
  let bestDistance = Infinity
  for (const pos of blockBoundaries(view.state)) {
    const d = Math.abs(boundaryTop(view, pos) - y)
    if (d < bestDistance) {
      best = pos
      bestDistance = d
    }
  }
  return best
}

/** W3-22b DropIndicator: 점 · 선 · "여기에 넣기" */
class IndicatorMarker implements LayerMarker {
  readonly left: number
  readonly top: number
  readonly width: number
  constructor(left: number, top: number, width: number) {
    this.left = left
    this.top = top
    this.width = width
  }
  eq(other: IndicatorMarker) {
    return other.left === this.left && other.top === this.top && other.width === this.width
  }
  draw() {
    const el = document.createElement('div')
    el.className = 'cm-insert-indicator'
    const dot = document.createElement('span')
    dot.className = 'cm-insert-indicator-dot'
    const line = document.createElement('span')
    line.className = 'cm-insert-indicator-line'
    const label = document.createElement('span')
    label.className = 'cm-insert-indicator-label'
    label.textContent = '여기에 넣기'
    el.append(dot, line, label)
    this.update(el)
    return el
  }
  update(el: HTMLElement) {
    el.style.left = `${this.left}px`
    el.style.top = `${this.top}px`
    el.style.width = `${this.width}px`
    return true
  }
}

const indicatorLayer = layer({
  above: true,
  class: 'cm-insert-indicator-layer',
  update: (u) =>
    u.state.field(indicatorField) !== u.startState.field(indicatorField) ||
    u.docChanged ||
    u.geometryChanged,
  markers(view) {
    const pos = view.state.field(indicatorField)
    if (pos === null) return []
    // 레이어 기준(스크롤 영역의 내용 처음)으로 바꾼다. CodeMirror RectangleMarker와 같은 계산
    const scroller = view.scrollDOM.getBoundingClientRect()
    const content = view.contentDOM.getBoundingClientRect()
    const baseLeft = scroller.left - view.scrollDOM.scrollLeft * view.scaleX
    const baseTop = scroller.top - view.scrollDOM.scrollTop * view.scaleY
    const top = view.documentTop + boundaryTop(view, pos) - baseTop
    return [new IndicatorMarker(content.left - baseLeft, top, content.width)]
  },
})

function hasRecommendationDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(RECOMMENDATION_DRAG_TYPE)
}

/**
 * 추천 카드를 놓을 수 있게 한다. 놓으면 onDrop(추천 id, 자리)을 부른다.
 * 넣기(insert)와 저장은 부른 쪽이 맡는다.
 */
export function recommendDrop(options: {
  onDrop: (recommendationId: string, pos: number) => void
  /** 끌고 있는 카드를 이 편집기에 놓을 수 있는지 (카드는 그 추천 패널의 노트에만 넣는다). 아니면 놓을 곳이 아니다 */
  accepts: () => boolean
}): Extension {
  const clear = (view: EditorView) => {
    if (view.state.field(indicatorField) !== null) {
      view.dispatch({ effects: setInsertIndicator.of(null) })
    }
  }
  return [
    indicatorField,
    indicatorLayer,
    EditorView.domEventHandlers({
      dragover(e, view) {
        if (!hasRecommendationDrag(e)) return false
        if (!options.accepts()) {
          // preventDefault를 하지 않으면 놓을 수 없는 곳이 된다
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
          clear(view)
          return true
        }
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
        const pos = nearestBoundary(view, e.clientY)
        if (view.state.field(indicatorField) !== pos) {
          view.dispatch({ effects: setInsertIndicator.of(pos) })
        }
        return true
      },
      dragleave(e, view) {
        if (!hasRecommendationDrag(e)) return false
        // 본문 안의 다른 요소로 옮겨 갈 때도 dragleave가 온다. 편집기 밖으로 나갈 때만 지운다
        const next = e.relatedTarget
        if (!(next instanceof Node) || !view.dom.contains(next)) clear(view)
        return true
      },
      drop(e, view) {
        if (!hasRecommendationDrag(e)) return false
        e.preventDefault()
        const id = e.dataTransfer?.getData(RECOMMENDATION_DRAG_TYPE) ?? ''
        const pos = nearestBoundary(view, e.clientY)
        clear(view)
        if (id && options.accepts()) options.onDrop(id, pos)
        return true
      },
    }),
  ]
}
