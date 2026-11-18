// 추천 카드를 노트에 넣고 '이해함'으로 남기는 순서 (Issue #43).
// 넣기 → 저장(PUT /notes) → 성공하면 '이해함'(POST feedback). 어디서 멈췄는지 카드마다 기억해 같은 블록이 두 번 들어가지 않게 한다.
// - 저장 실패(연결·500 등): 블록은 놓은 자리에 둔다(자동 저장이 이어서 저장한다). 카드는 "넣었지만 아직 저장 안 됨"이 되어
//   다시 넣을 수 없고, "다시 시도"는 노트를 저장한 뒤에만 '이해함'을 보낸다.
// - 저장 충돌(NOTE_CONFLICT): 기존 충돌 안내에 맡기고 카드는 막지 않는다. 충돌이 풀리기 전에는 저장이 멈춰 있어 넣기가 막히고(stuck),
//   "다른 곳의 내용 불러오기"를 하면 넣은 블록이 사라지므로 다시 넣을 수 있어야 한다.
// - '이해함' 실패: 블록은 저장됐다. 카드는 "넣었지만 기록 안 됨"이 되어 다시 넣을 수 없고, "다시 시도"는 '이해함'만 보낸다.
// 메모리에만 기억한다. 새로 고치면 사라진다 (TODO.md B3).
import type { InsertTarget } from './insertBridge'

/** 노트에 넣었지만 끝나지 않은 카드 */
export type PendingInsert =
  /** 넣기·저장·'이해함' 보내기가 진행 중이다. 다른 답 버튼도 막는다 (known이 먼저 기록되지 않게) */
  | { kind: 'working' }
  /** 넣었지만 노트가 아직 저장되지 않았다. noteId는 넣은 노트 */
  | { kind: 'unsaved'; noteId: string }
  /** 넣고 저장했지만 '이해함'을 보내지 못했다 */
  | { kind: 'unanswered' }

/** '이해함'을 보낸 결과. closed는 409(근거가 바뀐 추천·이미 답한 추천)로 카드를 닫았다 */
export type AnswerResult = 'answered' | 'closed' | 'failed'

export type InsertResult =
  /** 하지 않았다 (넣을 편집기가 없음, 이미 넣었거나 넣는 중) */
  | 'skipped'
  /** 열린 노트가 이 추천 패널의 노트가 아니라 넣지 않았다 */
  | 'wrong-note'
  /** 저장이 멈춰 있어 넣지 않았다 */
  | 'blocked'
  /** 저장이 충돌했다. '이해함'은 보내지 않았다 */
  | 'conflict'
  /** 넣었지만 저장하지 못했다. '이해함'은 보내지 않았다 */
  | 'unsaved'
  /** 다시 시도: 넣은 노트가 열려 있지 않아 저장을 확인하지 못했다 */
  | 'other-note'
  | AnswerResult

export interface InsertFlowDeps {
  getTarget: () => InsertTarget | null
  /** '이해함'을 보낸다 (다시 보내기 포함). 화면 처리(다음 카드·알림)는 여기서 한다 */
  answer: (recommendationId: string) => Promise<AnswerResult>
}

/** 카드를 넣을 수 있는 노트인지: 카드는 그 추천 패널의 노트(추천을 요청한 노트)에만 넣는다 */
export function canInsertInto(target: InsertTarget | null, panelNoteId: string | null): boolean {
  return target !== null && panelNoteId !== null && target.noteId === panelNoteId
}

export class InsertFlow {
  private deps: InsertFlowDeps
  private pending: ReadonlyMap<string, PendingInsert> = new Map()
  private readonly listeners = new Set<() => void>()

  constructor(deps: InsertFlowDeps = { getTarget: () => null, answer: async () => 'failed' }) {
    this.deps = deps
  }

  /** 편집기와 '이해함' 처리를 바꾼다 (화면이 다시 그려질 때마다 최신 것으로) */
  connect(deps: InsertFlowDeps) {
    this.deps = deps
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 끝나지 않은 카드들 (바뀔 때마다 새 Map) */
  getPending = (): ReadonlyMap<string, PendingInsert> => this.pending

  /** 이 카드를 넣을 수 있는지 (이미 넣었거나 넣는 중이면 아니다) */
  canInsert(id: string): boolean {
    return !this.pending.has(id)
  }

  /** 넣기·저장·'이해함'이 진행 중인지 (다른 답 버튼을 막는다) */
  isWorking(id: string): boolean {
    return this.pending.get(id)?.kind === 'working'
  }

  /**
   * 카드를 노트의 자리 pos에 넣고 저장한 뒤, 성공하면 '이해함'을 보낸다.
   * panelNoteId는 카드가 나온 추천 패널의 노트다. 열린 노트가 다르면 넣지 않는다.
   */
  async insert(
    id: string,
    markdown: string,
    pos: number,
    panelNoteId: string | null,
  ): Promise<InsertResult> {
    const target = this.deps.getTarget()
    if (!target || !this.canInsert(id)) return 'skipped'
    if (!canInsertInto(target, panelNoteId)) return 'wrong-note'
    this.setPending(id, { kind: 'working' })
    const outcome = await target.insert(pos, markdown)
    if (!outcome.ok) {
      if (outcome.reason === 'failed' && !outcome.conflict) {
        this.setPending(id, { kind: 'unsaved', noteId: target.noteId })
        return 'unsaved'
      }
      this.setPending(id, null)
      return outcome.reason === 'stuck' ? 'blocked' : 'conflict'
    }
    return this.answer(id)
  }

  /**
   * "다시 시도". 저장이 안 된 카드는 넣은 노트를 먼저 저장하고, 저장되면 '이해함'을 보낸다.
   * 저장이 여전히 실패하면 '이해함'을 보내지 않는다. '이해함'만 못 보낸 카드는 '이해함'만 다시 보낸다.
   */
  async retry(id: string): Promise<InsertResult> {
    const pending = this.pending.get(id)
    if (!pending || pending.kind === 'working') return 'skipped'
    if (pending.kind === 'unsaved') {
      const target = this.deps.getTarget()
      if (!target || target.noteId !== pending.noteId) return 'other-note'
      this.setPending(id, { kind: 'working' })
      const saved = await target.save()
      if (!saved.ok) {
        if (!saved.conflict) {
          this.setPending(id, pending)
          return 'unsaved'
        }
        // 충돌은 기존 충돌 안내에 맡긴다. 불러오기를 하면 넣은 블록이 사라지므로 카드를 다시 넣을 수 있게 한다
        this.setPending(id, null)
        return 'conflict'
      }
    }
    return this.answer(id)
  }

  /** '이해함'을 보낸다. 보내는 동안에도 working으로 두어 다른 답 버튼을 막는다 */
  private async answer(id: string): Promise<AnswerResult> {
    this.setPending(id, { kind: 'working' })
    const result = await this.deps.answer(id)
    this.setPending(id, result === 'failed' ? { kind: 'unanswered' } : null)
    return result
  }

  private setPending(id: string, value: PendingInsert | null) {
    const next = new Map(this.pending)
    if (value) next.set(id, value)
    else next.delete(id)
    this.pending = next
    this.listeners.forEach((l) => l())
  }
}
