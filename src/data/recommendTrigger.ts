// 추천(새로운 지식) 요청 시점. 규칙: docs/team/meetings/2026-11-04-meeting.md 11·12·21행
// - 기준은 입력이다(제목·본문 편집). 마지막 입력 후 RECOMMEND_IDLE_MS 동안 입력이 없으면 요청한다.
// - 계속 입력 중이면 최대 RECOMMEND_MAX_INTERVAL_MS마다 한 번 요청한다.
//   이 시간은 "마지막 요청(또는 처음) 뒤의 첫 입력"부터 센다. 요청하면 두 타이머를 모두 끄고, 다음 입력이 새로 센다.
// - 요청할 때 저장되지 않은 변경이 있으면 저장을 재촉하고(flush) 저장이 끝난 뒤(onSaved) 요청한다. BE는 저장된 내용으로 분석한다.
// - 저장된 version이 그 노트에 마지막으로 요청한 version과 같으면 요청하지 않는다(가져오기로 요청한 version 포함).
// - 상태는 노트별이고 편집기 바깥(모듈)에 있다. 노트를 옮기거나 편집기가 사라져도 이전 노트의 타이머는 남는다.
//   열기만 한 노트에는 요청하지 않는다(입력이 없으면 타이머도 없다).
// - 요청이 실패하면 알리지 않고, 그 version을 "마지막 요청"으로 남기지 않는다. 다음 입력 때 다시 요청한다.

/** 마지막 입력 뒤 이만큼 입력이 없으면 요청한다 (11/04 회의 N=5초, 실측 후 조정 예정) */
export const RECOMMEND_IDLE_MS = 5_000
/** 계속 입력 중일 때 요청 간격의 상한 (11/04 회의 M=30초, 실측 후 조정 예정) */
export const RECOMMEND_MAX_INTERVAL_MS = 30_000

/** 노트의 저장 상태. NoteSaver가 그대로 맞는다. */
export interface SavedSource {
  /** 서버에 아직 보내지 않았거나 보내는 중인 내용이 있는지 */
  hasUnsavedChanges(): boolean
  /** 서버에 저장된 것으로 아는 마지막 version */
  getVersion(): number
  /** 기다리지 않고 바로 저장한다 */
  flush(): void
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export interface RecommendTriggerOptions {
  /** 추천 작업을 요청한다. 실패하면 reject한다. */
  request: (noteId: string) => Promise<void>
  /** 추천이 켜져 있는지 (capabilities.discoveriesEnabled). 요청할 때마다 확인한다. */
  enabled: () => boolean
  timers?: Timers
}

interface NoteState {
  source: SavedSource | null
  idle: unknown
  cap: unknown
  /** 요청할 때가 됐지만 저장이 끝나지 않았다. 다음 onSaved에 요청한다. */
  waitingForSave: boolean
  /** 마지막으로 요청한(요청 중 포함) version */
  lastRequested: number | null
}

export interface RecommendTrigger {
  /** 제목·본문을 고칠 때마다 부른다 */
  onInput(noteId: string, source: SavedSource): void
  /** 저장이 성공할 때마다 서버가 돌려준 version으로 부른다 */
  onSaved(noteId: string, version: number): void
  /** 타이머 없이 바로 요청한다 (가져오기). 같은 version이면 보내지 않는다. */
  requestNow(noteId: string, version: number): Promise<void>
}

export function createRecommendTrigger(options: RecommendTriggerOptions): RecommendTrigger {
  const timers: Timers = options.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  }
  const notes = new Map<string, NoteState>()

  const stateOf = (noteId: string): NoteState => {
    let s = notes.get(noteId)
    if (!s) {
      s = { source: null, idle: null, cap: null, waitingForSave: false, lastRequested: null }
      notes.set(noteId, s)
    }
    return s
  }

  const clearTimers = (s: NoteState) => {
    if (s.idle !== null) timers.clearTimeout(s.idle)
    if (s.cap !== null) timers.clearTimeout(s.cap)
    s.idle = null
    s.cap = null
  }

  async function send(noteId: string, version: number) {
    if (!options.enabled()) return
    const s = stateOf(noteId)
    if (s.lastRequested === version) return
    const before = s.lastRequested
    s.lastRequested = version
    try {
      await options.request(noteId)
    } catch {
      // 실패는 알리지 않는다 (10/30: 실패 비노출). 기록을 되돌려 다음 입력 때 다시 요청되게 한다.
      if (s.lastRequested === version) s.lastRequested = before
    }
  }

  function fire(noteId: string) {
    const s = stateOf(noteId)
    clearTimers(s)
    if (!options.enabled() || !s.source) return
    if (s.source.hasUnsavedChanges()) {
      s.waitingForSave = true
      s.source.flush()
      return
    }
    void send(noteId, s.source.getVersion())
  }

  return {
    onInput(noteId, source) {
      const s = stateOf(noteId)
      s.source = source
      if (s.idle !== null) timers.clearTimeout(s.idle)
      s.idle = timers.setTimeout(() => fire(noteId), RECOMMEND_IDLE_MS)
      if (s.cap === null) s.cap = timers.setTimeout(() => fire(noteId), RECOMMEND_MAX_INTERVAL_MS)
    },

    onSaved(noteId, version) {
      const s = notes.get(noteId)
      if (!s?.waitingForSave) return
      s.waitingForSave = false
      void send(noteId, version)
    },

    requestNow: (noteId, version) => send(noteId, version),
  }
}
