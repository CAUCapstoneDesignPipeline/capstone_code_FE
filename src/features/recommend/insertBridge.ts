// 추천 패널과 열린 노트 편집기를 잇는다 (Issue #43: 카드를 노트에 끌어다 놓으면 "이해함").
// - 편집기는 자기를 넣을 곳(target)으로 등록한다. 패널은 키보드로 자리를 고를 때 이것을 쓴다.
// - 편집기에 카드를 놓으면 편집기가 drop()을 부르고, 패널이 등록한 처리(onDrop)가 넣기·저장·답 보내기를 맡는다.
import { createContext, useContext, useSyncExternalStore } from 'react'

/** 편집기에 넣은 결과. ok가 아니면 노트에 넣지 않았거나(stuck) 넣었지만 저장하지 못했다(failed) */
export type InsertOutcome =
  | { ok: true }
  /** 저장이 이미 멈춰 있어(제목 문제·충돌·삭제·로그인 만료) 넣지 않았다 */
  | { ok: false; reason: 'stuck' }
  /** 넣었지만 저장하지 못했다 (충돌이면 편집기가 기존 충돌 안내를 띄운다) */
  | { ok: false; reason: 'failed'; conflict: boolean }

/** 열린 노트 편집기 */
export interface InsertTarget {
  noteId: string
  /** 블록 사이 자리 (문서 위치, 오름차순) */
  boundaries(): number[]
  /** 자리 앞 블록의 첫 줄. 맨 앞이면 null */
  describe(pos: number): string | null
  /** "여기에 넣기" 선을 보이거나(scroll이면 그 자리로 스크롤) 지운다(null) */
  showIndicator(pos: number | null, scroll?: boolean): void
  /** pos에 마크다운 블록을 넣고 바로 저장한다. 분석 트리거로 치지 않는다 */
  insert(pos: number, markdown: string): Promise<InsertOutcome>
}

type Listener = () => void

export class InsertBridge {
  private target: InsertTarget | null = null
  private dropHandler: ((recommendationId: string, pos: number) => void) | null = null
  private readonly listeners = new Set<Listener>()

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getTarget = (): InsertTarget | null => this.target

  /** 편집기가 생길 때 등록하고, 사라질 때 같은 것으로 null을 넘겨 지운다 */
  setTarget(target: InsertTarget | null, previous?: InsertTarget) {
    if (target === null && previous && this.target !== previous) return
    this.target = target
    this.listeners.forEach((l) => l())
  }

  /** 패널이 카드를 놓았을 때의 처리를 등록한다 */
  setDropHandler(handler: ((recommendationId: string, pos: number) => void) | null) {
    this.dropHandler = handler
  }

  /** 편집기에 카드를 놓았다 */
  drop(recommendationId: string, pos: number) {
    this.dropHandler?.(recommendationId, pos)
  }
}

export const InsertBridgeContext = createContext<InsertBridge | null>(null)

export function useInsertBridge(): InsertBridge | null {
  return useContext(InsertBridgeContext)
}

/** 지금 열린 편집기 (없으면 null) */
export function useInsertTarget(bridge: InsertBridge | null): InsertTarget | null {
  return useSyncExternalStore(bridge?.subscribe ?? noopSubscribe, bridge?.getTarget ?? nullTarget)
}

const noopSubscribe = () => () => {}
const nullTarget = () => null
