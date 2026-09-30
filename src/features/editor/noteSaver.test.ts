import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type Note, type NoteUpdate } from '../../api'
import { NoteSaver } from './noteSaver'

const base: Note = {
  id: 'n1',
  topicId: null,
  title: '재시도 정책',
  body: '',
  version: 3,
  createdAt: '2026-09-29T00:00:00Z',
  updatedAt: '2026-09-29T00:00:00Z',
}

interface Call {
  input: NoteUpdate
  resolve: (note: Note) => void
  reject: (e: unknown) => void
}

/** 응답을 테스트에서 직접 돌려주는 가짜 save */
function setup(note: Note = base) {
  const calls: Call[] = []
  const onSaved = vi.fn()
  const save = vi.fn(
    (_id: string, input: NoteUpdate) =>
      new Promise<Note>((resolve, reject) => calls.push({ input, resolve, reject })),
  )
  const saver = new NoteSaver(note, { save, onSaved })
  /** 마지막 요청에 성공 응답 (version + 1) */
  const ok = async (i = calls.length - 1) => {
    const { input } = calls[i]
    calls[i].resolve({ ...note, title: input.title, body: input.body, version: input.version + 1 })
    await vi.advanceTimersByTimeAsync(0)
  }
  const fail = async (e: unknown, i = calls.length - 1) => {
    calls[i].reject(e)
    await vi.advanceTimersByTimeAsync(0)
  }
  return { saver, save, calls, ok, fail, onSaved }
}

const conflict = (current: Note) =>
  new ApiError('NOTE_CONFLICT', '다른 곳에서 먼저 수정되었습니다.', 409, { current })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('자동 저장', () => {
  it('입력이 멈추고 1초 뒤 최신 내용을 한 번만 저장한다', async () => {
    const { saver, save, calls } = setup()
    saver.edit({ body: 'a' })
    await vi.advanceTimersByTimeAsync(500)
    saver.edit({ body: 'ab' })
    await vi.advanceTimersByTimeAsync(999)
    expect(save).not.toHaveBeenCalled()
    expect(saver.getState().status).toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(calls[0].input).toEqual({ title: '재시도 정책', body: 'ab', version: 3 })
    expect(saver.getState().status).toBe('saving')
  })

  it('성공하면 받은 version을 다음 저장에 쓰고 저장됨이 된다', async () => {
    const { saver, calls, ok, onSaved } = setup()
    saver.edit({ body: 'a' })
    await vi.advanceTimersByTimeAsync(1000)
    await ok()
    expect(saver.getState().status).toBe('saved')
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 4 }))

    saver.edit({ body: 'ab' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls[1].input.version).toBe(4)
  })

  it('저장 요청은 한 번에 하나: 응답 전에 온 입력은 응답 뒤 새 version으로 저장한다', async () => {
    const { saver, save, calls, ok } = setup()
    saver.edit({ body: 'a' })
    await vi.advanceTimersByTimeAsync(1000)
    saver.edit({ body: 'ab' })
    await vi.advanceTimersByTimeAsync(3000) // 두 번째 저장 시점이 지났지만 첫 응답이 없다
    expect(save).toHaveBeenCalledTimes(1)
    expect(saver.getState().status).toBe('saving')

    await ok()
    expect(save).toHaveBeenCalledTimes(2)
    expect(calls[1].input).toEqual({ title: '재시도 정책', body: 'ab', version: 4 })
    await ok()
    expect(saver.getState().status).toBe('saved')
    expect(saver.hasUnsavedChanges()).toBe(false)
  })

  it('응답 뒤에도 입력이 이어지고 있으면 1초 기다린 다음 저장한다', async () => {
    const { saver, save, ok } = setup()
    saver.edit({ body: 'a' })
    await vi.advanceTimersByTimeAsync(1000)
    saver.edit({ body: 'ab' })
    await ok()
    expect(save).toHaveBeenCalledTimes(1)
    expect(saver.getState().status).toBe('pending')
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('flush()는 기다리지 않고 바로 저장한다', async () => {
    const { saver, save } = setup()
    saver.edit({ body: 'a' })
    saver.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('서버와 같은 내용이면 보내지 않는다', async () => {
    const { saver, save } = setup()
    saver.edit({ body: 'a' })
    saver.edit({ body: '' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).not.toHaveBeenCalled()
    expect(saver.getState().status).toBe('saved')
  })
})

describe('충돌과 삭제', () => {
  it('NOTE_CONFLICT면 자동 저장을 멈추고 서버의 현재 노트를 알려준다', async () => {
    const { saver, save, fail } = setup()
    const current = { ...base, body: '다른 곳에서 고친 본문', version: 5 }
    saver.edit({ body: '내 본문' })
    await vi.advanceTimersByTimeAsync(1000)
    await fail(conflict(current))

    expect(saver.getState()).toMatchObject({ status: 'conflict', conflictNote: current })
    saver.edit({ body: '내 본문 더' })
    saver.flush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(saver.hasUnsavedChanges()).toBe(true)
  })

  it('다른 곳의 내용을 불러오면 그 version으로 자동 저장을 다시 켠다', async () => {
    const { saver, calls, fail } = setup()
    const current = { ...base, body: '다른 곳에서 고친 본문', version: 5 }
    saver.edit({ body: '내 본문' })
    await vi.advanceTimersByTimeAsync(1000)
    await fail(conflict(current))

    expect(saver.loadServerVersion(current)).toEqual({ title: base.title, body: current.body })
    expect(saver.getState().status).toBe('saved')
    saver.edit({ body: '다른 곳에서 고친 본문 + 이어 쓰기' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls[1].input.version).toBe(5)
  })

  it('NOT_FOUND면 삭제됨으로 멈춘다', async () => {
    const { saver, save, fail } = setup()
    saver.edit({ body: 'a' })
    await vi.advanceTimersByTimeAsync(1000)
    await fail(new ApiError('NOT_FOUND', '없음', 404))
    expect(saver.getState().status).toBe('deleted')
    saver.edit({ body: 'ab' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('충돌이 나면 기다리던 다음 저장도 보내지 않는다', async () => {
    const { saver, save, fail } = setup()
    saver.edit({ body: 'a' })
    await vi.advanceTimersByTimeAsync(1000)
    saver.edit({ body: 'ab' })
    await vi.advanceTimersByTimeAsync(1000)
    await fail(conflict({ ...base, version: 9 }))
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('제목 오류', () => {
  it("제목에 '/'가 있으면 보내지 않고 이유를 보여준다", async () => {
    const { saver, save } = setup()
    saver.edit({ title: 'a/b' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).not.toHaveBeenCalled()
    expect(saver.getState()).toMatchObject({
      status: 'invalid',
      message: "제목에는 '/'를 쓸 수 없습니다.",
    })
  })

  it('NOTE_TITLE_TAKEN이면 제목을 고칠 때까지 저장하지 않는다', async () => {
    const { saver, save, calls, fail } = setup()
    saver.edit({ title: '인덱스' })
    await vi.advanceTimersByTimeAsync(1000)
    await fail(new ApiError('NOTE_TITLE_TAKEN', '같은 제목의 노트가 있습니다.', 409))
    expect(saver.getState()).toMatchObject({
      status: 'invalid',
      message: '같은 제목의 노트가 있습니다.',
    })

    saver.edit({ body: '본문만 고침' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenCalledTimes(1)

    saver.edit({ title: '인덱스 2' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls[1].input).toEqual({ title: '인덱스 2', body: '본문만 고침', version: 3 })
  })

  it('제목 오류를 받는 사이 제목을 이미 고쳤으면 새 제목으로 다시 저장한다', async () => {
    const { saver, save, calls, fail } = setup()
    saver.edit({ title: '인덱스' })
    await vi.advanceTimersByTimeAsync(1000)
    saver.edit({ title: '인덱스 2' })
    await fail(new ApiError('NOTE_TITLE_TAKEN', '같은 제목의 노트가 있습니다.', 409))
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(calls[1].input.title).toBe('인덱스 2')
  })
})

describe('연결 실패', () => {
  it('error가 되고, 다음 입력 때 다시 시도한다', async () => {
    const { saver, save, fail } = setup()
    saver.edit({ body: 'a' })
    await vi.advanceTimersByTimeAsync(1000)
    await fail(new ApiError('NETWORK_ERROR', '서버에 연결할 수 없습니다.', 0))
    expect(saver.getState()).toMatchObject({
      status: 'error',
      message: '서버에 연결할 수 없습니다.',
    })

    saver.edit({ body: 'ab' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('시간 초과된 저장이 실제로는 반영됐으면, 이어지는 충돌은 자기 자신과의 충돌로 보고 계속 저장한다', async () => {
    const { saver, save, calls, fail, ok } = setup()
    saver.edit({ body: 'a' })
    await vi.advanceTimersByTimeAsync(1000)
    await fail(new ApiError('NETWORK_ERROR', '서버가 응답하지 않습니다.', 0)) // 서버에는 version 4로 저장됨

    saver.edit({ body: 'ab' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls[1].input.version).toBe(3)
    await fail(conflict({ ...base, body: 'a', version: 4 }))

    expect(save).toHaveBeenCalledTimes(3)
    expect(calls[2].input).toEqual({ title: '재시도 정책', body: 'ab', version: 4 })
    await ok()
    expect(saver.getState().status).toBe('saved')
  })

  it('시간 초과 뒤 다른 곳에서 고친 내용과의 충돌은 그대로 충돌이다', async () => {
    const { saver, save, fail } = setup()
    saver.edit({ body: 'a' })
    await vi.advanceTimersByTimeAsync(1000)
    await fail(new ApiError('NETWORK_ERROR', '서버가 응답하지 않습니다.', 0))
    saver.edit({ body: 'ab' })
    await vi.advanceTimersByTimeAsync(1000)
    await fail(conflict({ ...base, body: '다른 곳', version: 4 }))
    expect(save).toHaveBeenCalledTimes(2)
    expect(saver.getState().status).toBe('conflict')
  })
})

describe('떠날 때 확인', () => {
  it('자동 저장 중이거나 기다리는 중이면 떠나도 된다 (떠날 때 저장된다)', async () => {
    const { saver } = setup()
    saver.edit({ body: 'a' })
    expect(saver.hasStuckChanges()).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(saver.hasStuckChanges()).toBe(false)
  })

  it('충돌·제목 오류로 멈춰 있고 저장 안 된 내용이 있으면 확인한다', async () => {
    const { saver, fail } = setup()
    saver.edit({ title: 'a/b' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(saver.hasStuckChanges()).toBe(true)

    saver.edit({ title: base.title })
    await vi.advanceTimersByTimeAsync(1000)
    expect(saver.hasStuckChanges()).toBe(false)

    saver.edit({ body: '내 본문' })
    await vi.advanceTimersByTimeAsync(1000)
    await fail(conflict({ ...base, version: 5 }))
    expect(saver.hasStuckChanges()).toBe(true)
  })
})
