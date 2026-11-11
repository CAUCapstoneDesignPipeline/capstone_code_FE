// 추천(새로운 지식) 요청 시점. 규칙: docs/team/meetings/2026-11-04-meeting.md 11·12·21행
// - 기준은 입력이다(제목·본문 편집). 마지막 입력 후 RECOMMEND_IDLE_MS 동안 입력이 없으면 요청한다.
// - 계속 입력 중이면 최대 RECOMMEND_MAX_INTERVAL_MS마다 한 번 요청한다.
//   이 시간은 "마지막 요청(또는 처음) 뒤의 첫 입력"부터 센다. 요청하면 두 타이머를 모두 끄고, 다음 입력이 새로 센다.
// - 요청할 때 저장되지 않은 변경이 있으면 저장을 재촉하고(flush) 저장이 끝난 뒤(onSaved) 요청한다. BE는 저장된 내용으로 분석한다.
//   그 저장 뒤에도 저장할 내용이 남아 있으면 유휴 타이머를 다시 걸어 최신 내용도 요청되게 한다.
// - 저장이 멈춰 있으면(잘못된 제목·실패·충돌·로그인 만료) 요청도 저장 대기도 하지 않는다. 다음 입력이 다시 센다.
// - 저장된 version이 그 노트에 마지막으로 요청한 version과 같으면 요청하지 않는다(가져오기로 요청한 version 포함).
// - 상태는 노트별이고 편집기 바깥(모듈)에 있다. 노트를 옮기거나 편집기가 사라져도 이전 노트의 타이머는 남는다.
//   열기만 한 노트에는 요청하지 않는다(입력이 없으면 타이머도 없다). 지운 노트는 forget()으로 잊는다.
// - 요청이 실패하면 알리지 않고, 그 version을 "마지막 요청"으로 남기지 않는다. 다음 입력 때 다시 요청한다.

/** 마지막 입력 뒤 이만큼 입력이 없으면 요청한다 (11/04 회의 N=5초, 실측 후 조정 예정) */
export const RECOMMEND_IDLE_MS = 5_000
/** 계속 입력 중일 때 요청 간격의 상한 (11/04 회의 M=30초, 실측 후 조정 예정) */
export const RECOMMEND_MAX_INTERVAL_MS = 30_000

/** 노트의 저장 상태. NoteSaver가 그대로 맞는다. */
export interface SavedSource {
  /** 서버에 아직 보내지 않았거나 보내는 중인 내용이 있는지 */
  hasUnsavedChanges(): boolean
  /** 저장이 멈춰 있어서(invalid·error·conflict·deleted·로그인 만료) 보내지 못한 내용이 있는지 */
  hasStuckChanges(): boolean
  /** 서버에 저장된 것으로 아는 마지막 version */
  getVersion(): number
  /** 기다리지 않고 바로 저장한다 */
  flush(): void
}

export interface RecommendTriggerOptions {
  /** 추천 작업을 요청한다. 실패하면 reject한다. */
  request: (noteId: string) => Promise<void>
  /** 추천이 켜져 있는지 (capabilities.discoveriesEnabled). 요청할 때마다 확인한다. */
  enabled: () => boolean
}

type Timer = ReturnType<typeof setTimeout>

interface NoteState {
  /** 마지막 입력이 온 편집기의 저장 상태. 요청을 보내면 놓는다(편집기가 사라진 뒤 붙잡지 않게). */
  source: SavedSource | null
  idle: Timer | null
  cap: Timer | null
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
  /** 지운 노트: 타이머와 상태를 버린다 */
  forget(noteId: string): void
  /** 로그아웃·로그인 만료: 모든 노트의 타이머와 상태를 버린다 */
  clear(): void
}

export function createRecommendTrigger(options: RecommendTriggerOptions): RecommendTrigger {
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
    if (s.idle !== null) clearTimeout(s.idle)
    if (s.cap !== null) clearTimeout(s.cap)
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
    const source = s.source
    if (!options.enabled() || !source) return
    if (source.hasStuckChanges()) {
      // 저장이 멈췄다. 나중에 저장되더라도 그때 바로 보내지 않고, 다음 입력의 타이머를 따른다.
      s.waitingForSave = false
      return
    }
    if (source.hasUnsavedChanges()) {
      s.waitingForSave = true
      source.flush()
      return
    }
    s.source = null
    void send(noteId, source.getVersion())
  }

  return {
    onInput(noteId, source) {
      const s = stateOf(noteId)
      s.source = source
      if (s.idle !== null) clearTimeout(s.idle)
      s.idle = setTimeout(() => fire(noteId), RECOMMEND_IDLE_MS)
      if (s.cap === null) s.cap = setTimeout(() => fire(noteId), RECOMMEND_MAX_INTERVAL_MS)
    },

    onSaved(noteId, version) {
      const s = notes.get(noteId)
      if (!s?.waitingForSave) return
      s.waitingForSave = false
      void send(noteId, version)
      if (s.source?.hasUnsavedChanges()) {
        // 이 저장 뒤에 들어온 입력이 아직 저장되지 않았다. 최신 내용도 요청되게 유휴 타이머를 다시 건다.
        // (저장이 끝날 때까지 계속 기다리면 쉬지 않고 입력할 때 30초 상한이 깨진다.)
        if (s.idle === null) s.idle = setTimeout(() => fire(noteId), RECOMMEND_IDLE_MS)
      } else if (s.idle === null) {
        s.source = null
      }
    },

    requestNow: (noteId, version) => send(noteId, version),

    forget(noteId) {
      const s = notes.get(noteId)
      if (!s) return
      clearTimers(s)
      notes.delete(noteId)
    },

    clear() {
      notes.forEach(clearTimers)
      notes.clear()
    },
  }
}
