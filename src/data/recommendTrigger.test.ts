import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRecommendTrigger,
  RECOMMEND_IDLE_MS,
  RECOMMEND_MAX_INTERVAL_MS,
  type RecommendTrigger,
  type SavedSource,
} from './recommendTrigger'

/** NoteSaver 대신 쓴다. edit()은 바로 저장된 것으로 친다(saved=false로 두면 저장 대기). */
class FakeSaver implements SavedSource {
  version = 1
  unsaved = false
  flush = vi.fn()
  hasUnsavedChanges = () => this.unsaved
  getVersion = () => this.version
}

describe('추천 요청 시점 (11/04: 마지막 입력 후 5초, 계속 입력 중이면 최대 30초)', () => {
  let request: ReturnType<typeof vi.fn<(noteId: string) => Promise<void>>>
  let enabled: boolean
  let trigger: RecommendTrigger

  /** 입력하고 바로 저장된 것으로 친다 (version을 올리고 onSaved) */
  const typeAndSave = (noteId: string, saver: FakeSaver) => {
    trigger.onInput(noteId, saver)
    saver.version += 1
    trigger.onSaved(noteId, saver.version)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    request = vi.fn<(noteId: string) => Promise<void>>().mockResolvedValue(undefined)
    enabled = true
    trigger = createRecommendTrigger({ request, enabled: () => enabled })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('입력 후 5초 동안 입력이 없으면 1번 요청한다', async () => {
    const a = new FakeSaver()
    typeAndSave('a', a)
    await vi.advanceTimersByTimeAsync(RECOMMEND_IDLE_MS - 1)
    expect(request).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('a')
    await vi.advanceTimersByTimeAsync(RECOMMEND_MAX_INTERVAL_MS)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('4초 간격으로 40초 동안 계속 입력하면 30초에 1번, 멈춘 뒤 5초에 1번 요청한다', async () => {
    const a = new FakeSaver()
    const calls: number[] = []
    request.mockImplementation(async () => {
      calls.push(Date.now())
    })
    const start = Date.now()
    for (let t = 0; t <= 40_000; t += 4_000) {
      typeAndSave('a', a)
      if (t < 40_000) await vi.advanceTimersByTimeAsync(4_000)
    }
    // 마지막 입력은 40초 시점
    await vi.advanceTimersByTimeAsync(RECOMMEND_IDLE_MS)
    expect(calls.map((c) => c - start)).toEqual([30_000, 40_000 + RECOMMEND_IDLE_MS])
  })

  it('저장된 version이 마지막으로 요청한 version과 같으면 요청하지 않는다', async () => {
    const a = new FakeSaver()
    typeAndSave('a', a)
    await vi.advanceTimersByTimeAsync(RECOMMEND_IDLE_MS)
    expect(request).toHaveBeenCalledTimes(1)

    // 입력은 했지만 저장된 내용이 그대로다 (같은 글자를 지웠다 다시 쓴 경우 등)
    trigger.onInput('a', a)
    await vi.advanceTimersByTimeAsync(RECOMMEND_IDLE_MS)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('타이머가 끝났을 때 저장이 안 끝났으면 바로 요청하지 않고 저장이 끝난 뒤 1번 요청한다', async () => {
    const a = new FakeSaver()
    a.unsaved = true
    trigger.onInput('a', a)
    await vi.advanceTimersByTimeAsync(RECOMMEND_IDLE_MS)
    expect(request).not.toHaveBeenCalled()
    expect(a.flush).toHaveBeenCalledTimes(1)

    a.unsaved = false
    a.version = 2
    trigger.onSaved('a', 2)
    await vi.advanceTimersByTimeAsync(0)
    expect(request).toHaveBeenCalledTimes(1)

    // 기다리던 요청은 한 번만 보낸다
    trigger.onSaved('a', 3)
    await vi.advanceTimersByTimeAsync(RECOMMEND_MAX_INTERVAL_MS)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('A 노트 입력 직후 B 노트로 옮기면 5초 뒤 A만 1번, B는 0번 요청한다', async () => {
    const a = new FakeSaver()
    typeAndSave('a', a)
    // B를 열기만 한다: 입력이 없으므로 트리거를 부르지 않는다
    await vi.advanceTimersByTimeAsync(RECOMMEND_MAX_INTERVAL_MS)
    expect(request.mock.calls).toEqual([['a']])
  })

  it('가져오기로 만든 노트마다 1번 요청하고, 바로 뒤 같은 version이면 다시 요청하지 않는다', async () => {
    await trigger.requestNow('x', 0)
    await trigger.requestNow('y', 0)
    expect(request.mock.calls).toEqual([['x'], ['y']])

    // 가져온 노트를 열고 입력했지만 저장된 version이 그대로다
    const x = new FakeSaver()
    x.version = 0
    trigger.onInput('x', x)
    await vi.advanceTimersByTimeAsync(RECOMMEND_IDLE_MS)
    await trigger.requestNow('y', 0)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('추천이 꺼져 있으면(discoveriesEnabled가 false) 요청하지 않는다', async () => {
    enabled = false
    const a = new FakeSaver()
    typeAndSave('a', a)
    await vi.advanceTimersByTimeAsync(RECOMMEND_MAX_INTERVAL_MS)
    await trigger.requestNow('b', 0)
    expect(request).not.toHaveBeenCalled()
  })

  it('요청이 실패하면 그 version을 기록하지 않아 다음 입력 때 다시 요청한다', async () => {
    request.mockRejectedValueOnce(new Error('network'))
    const a = new FakeSaver()
    typeAndSave('a', a)
    await vi.advanceTimersByTimeAsync(RECOMMEND_IDLE_MS)
    expect(request).toHaveBeenCalledTimes(1)

    trigger.onInput('a', a)
    await vi.advanceTimersByTimeAsync(RECOMMEND_IDLE_MS)
    expect(request).toHaveBeenCalledTimes(2)
  })
})
