// 노트 한 건의 저장을 맡는다. 규칙: docs/api/rules.md "수정 충돌 처리 · FE"
// - 입력이 멈추고 1초 뒤 저장, flush()는 바로 저장 (Ctrl/⌘+S, 노트를 떠날 때)
// - 저장 요청은 한 번에 하나. 응답을 기다리는 동안 들어온 입력은 응답 뒤 최신 내용으로 한 번 더 저장
// - 응답의 version을 다음 요청에 쓴다 (안 그러면 자기 자신과 충돌한다)
// - NOTE_CONFLICT·NOT_FOUND를 받으면 자동 저장을 멈추고 편집기 내용은 그대로 둔다
// - 로그인이 만료되면(UNAUTHENTICATED) 다시 로그인할 때까지 자동 저장을 멈춘다 (resume()으로 잇는다)
import {
  conflictCurrent,
  isApiError,
  validationFields,
  type Note,
  type NoteUpdate,
} from '../../api'
import { checkName, normalizeName, NOTE_TITLE_MAX } from '../../lib/names'

export type SaveStatus =
  /** 서버와 같다 */
  | 'saved'
  /** 저장할 내용 있음 (기다리는 중) */
  | 'pending'
  | 'saving'
  /** 제목이 규칙에 맞지 않거나 겹친다. 제목을 고치면 다시 저장한다. */
  | 'invalid'
  /** 연결 실패 등. 다음 입력이나 flush()에 다시 시도한다. */
  | 'error'
  /** 다른 곳에서 먼저 고쳤다. 자동 저장 멈춤 */
  | 'conflict'
  /** 다른 곳에서 지웠다. 자동 저장 멈춤 */
  | 'deleted'

export interface SaverState {
  status: SaveStatus
  /** invalid·error일 때 보여줄 문장 */
  message: string | null
  /** conflict일 때 서버에 있는 현재 노트 */
  conflictNote: Note | null
}

export interface Draft {
  title: string
  body: string
}

export interface NoteSaverOptions {
  save: (noteId: string, input: NoteUpdate) => Promise<Note>
  /** 저장이 성공할 때마다 서버가 돌려준 노트로 부른다 */
  onSaved?: (note: Note) => void
  delayMs?: number
}

const sameDraft = (a: Draft, b: Draft) => a.title === b.title && a.body === b.body

/** 서버가 정규화(NFC, 제목 앞뒤 공백 제거)해 저장한 내용과 같은지 */
const sameOnServer = (a: Draft, b: Draft) =>
  normalizeName(a.title) === normalizeName(b.title) &&
  a.body.normalize('NFC') === b.body.normalize('NFC')

export class NoteSaver {
  readonly noteId: string
  private readonly options: Required<Pick<NoteSaverOptions, 'delayMs'>> & NoteSaverOptions
  private version: number
  private draft: Draft
  /** 서버에 있다고 알고 있는 내용 */
  private saved: Draft
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight = false
  /** 요청 중에 저장 시점이 왔다. 응답 뒤 바로 한 번 더 저장한다. */
  private saveAgain = false
  /** invalid가 된 제목. 제목이 이것과 달라지면 다시 저장한다. */
  private rejectedTitle: string | null = null
  /** 응답을 받지 못한 저장 (시간 초과 등). 서버에는 반영됐을 수도 있다. */
  private unconfirmed: Draft | null = null
  private state: SaverState = { status: 'saved', message: null, conflictNote: null }
  private readonly listeners = new Set<() => void>()
  /** 노트를 지우기로 했다. 이후 어떤 저장도 보내지 않는다. */
  private discarded = false
  /** 로그인이 만료됐다. 다시 로그인해 resume()을 부를 때까지 저장을 보내지 않는다. */
  private waitingForLogin = false

  constructor(note: Note, options: NoteSaverOptions) {
    this.noteId = note.id
    this.options = { delayMs: 1000, ...options }
    this.version = note.version
    this.draft = { title: note.title, body: note.body }
    this.saved = this.draft
  }

  // --- React(useSyncExternalStore)용 ---

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): SaverState => this.state

  // --- 편집기에서 부르는 것 ---

  /** 입력이 바뀔 때마다 부른다 */
  edit(change: Partial<Draft>) {
    this.draft = { ...this.draft, ...change }
    if (this.isStopped()) return
    if (this.state.status === 'invalid' && this.draft.title === this.rejectedTitle) return
    this.rejectedTitle = null

    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.run()
    }, this.options.delayMs)
    if (!this.inFlight) this.setState({ status: 'pending' })
  }

  /** 기다리지 않고 바로 저장한다. 멈춘 상태(conflict·deleted)면 아무것도 하지 않는다. */
  flush() {
    this.clearTimer()
    if (this.isStopped()) return
    if (this.state.status === 'invalid' && this.draft.title === this.rejectedTitle) return
    void this.run()
  }

  /** 충돌 뒤 "다른 곳의 내용 불러오기": 서버 내용으로 바꾸고 자동 저장을 다시 켠다. 편집기에 채울 내용을 돌려준다. */
  loadServerVersion(note: Note): Draft {
    this.clearTimer()
    this.version = note.version
    this.draft = { title: note.title, body: note.body }
    this.saved = this.draft
    this.rejectedTitle = null
    this.setState({ status: 'saved', message: null, conflictNote: null })
    return this.draft
  }

  /** 다시 로그인한 뒤 부른다. 로그인 만료로 멈춘 저장을 잇는다. */
  resume() {
    if (!this.waitingForLogin) return
    this.waitingForLogin = false
    this.flush()
  }

  /** 노트를 지우기 전에 부른다. 기다리던 저장을 버리고 이후 저장을 보내지 않는다. */
  discard() {
    this.discarded = true
    this.clearTimer()
  }

  /** 서버에 아직 보내지 않은 내용이 있는지 (창을 닫기 전 경고용) */
  hasUnsavedChanges(): boolean {
    return this.inFlight || !sameDraft(this.draft, this.saved)
  }

  /** 자동 저장이 멈춰 있어서(invalid·error·conflict·deleted·로그인 만료) 이 노트를 떠나면 사라질 내용이 있는지 */
  hasStuckChanges(): boolean {
    const stuck: SaveStatus[] = ['invalid', 'error', 'conflict', 'deleted']
    return (
      (this.waitingForLogin || stuck.includes(this.state.status)) &&
      !sameDraft(this.draft, this.saved)
    )
  }

  /** 로그인이 만료돼 저장이 멈춰 있는지 */
  isWaitingForLogin(): boolean {
    return this.waitingForLogin
  }

  // --- 내부 ---

  private isStopped() {
    return (
      this.discarded ||
      this.waitingForLogin ||
      this.state.status === 'conflict' ||
      this.state.status === 'deleted'
    )
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private setState(patch: Partial<SaverState>) {
    this.state = { status: this.state.status, message: null, conflictNote: null, ...patch }
    this.listeners.forEach((l) => l())
  }

  private async run() {
    if (this.inFlight) {
      this.saveAgain = true
      return
    }
    if (this.isStopped()) return

    const snapshot = this.draft
    if (sameDraft(snapshot, this.saved)) {
      this.setState({ status: 'saved' })
      return
    }

    const problem = checkName(snapshot.title, '제목', NOTE_TITLE_MAX)
    if (problem) {
      this.rejectedTitle = snapshot.title
      this.setState({ status: 'invalid', message: problem })
      return
    }

    this.inFlight = true
    this.saveAgain = false
    this.setState({ status: 'saving' })
    try {
      const note = await this.options.save(this.noteId, { ...snapshot, version: this.version })
      this.version = note.version
      // 서버가 NFC 정규화·공백 제거를 하므로 돌려받은 값이 아니라 보낸 값을 기준으로 비교한다.
      this.saved = snapshot
      this.unconfirmed = null
      this.inFlight = false
      this.options.onSaved?.(note)
    } catch (e) {
      this.inFlight = false
      this.handleError(e, snapshot)
      return
    }

    if (this.saveAgain) {
      void this.run()
    } else if (sameDraft(this.draft, this.saved)) {
      this.setState({ status: 'saved' })
    } else {
      this.setState({ status: 'pending' })
    }
  }

  private handleError(e: unknown, snapshot: Draft) {
    this.saveAgain = false
    this.clearTimer()

    if (isApiError(e, 'NOTE_CONFLICT')) {
      const current = conflictCurrent(e)
      if (current && this.unconfirmed && sameOnServer(current, this.unconfirmed)) {
        // 응답을 못 받은 앞선 저장이 실제로는 반영됐다. 자기 자신과의 충돌이므로 그 version으로 이어서 저장한다.
        this.version = current.version
        this.saved = this.unconfirmed
        this.unconfirmed = null
        this.options.onSaved?.(current)
        void this.run()
        return
      }
      this.setState({ status: 'conflict', conflictNote: conflictCurrent(e) ?? null })
    } else if (isApiError(e, 'NOT_FOUND')) {
      this.setState({ status: 'deleted' })
    } else if (isApiError(e, 'UNAUTHENTICATED')) {
      // W1-00e: 다시 로그인할 때까지 "저장할 내용 있음"으로 둔다. 로그인 만료 창은 AuthGate가 띄운다.
      this.waitingForLogin = true
      this.setState({ status: 'pending' })
    } else if (
      isApiError(e, 'NOTE_TITLE_TAKEN') ||
      (isApiError(e, 'VALIDATION_FAILED') && validationFields(e).some((f) => f.field === 'title'))
    ) {
      this.rejectedTitle = snapshot.title
      this.setState({ status: 'invalid', message: e.message })
      // 응답을 기다리는 사이 제목을 이미 고쳤으면 그 제목으로 다시 저장한다.
      if (this.draft.title !== snapshot.title) this.edit({})
    } else {
      if (isApiError(e, 'NETWORK_ERROR')) this.unconfirmed = snapshot
      const message = isApiError(e) ? e.message : '저장하지 못했습니다.'
      this.setState({ status: 'error', message })
    }
  }
}
