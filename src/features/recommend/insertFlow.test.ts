import { describe, expect, it, vi } from 'vitest'
import type { InsertOutcome, InsertTarget } from './insertBridge'
import { canInsertInto, InsertFlow, type AnswerResult } from './insertFlow'

/** 편집기 대신 쓴다. 넣은 블록을 doc에 쌓고, 저장 결과는 테스트가 정한다 */
function setup() {
  let saveResult: { ok: true } | { ok: false; conflict: boolean } = { ok: true }
  const blocks: string[] = []
  const target: InsertTarget = {
    noteId: 'note-1',
    boundaries: () => [0],
    describe: () => null,
    showIndicator: () => {},
    insert: vi.fn(async (_pos: number, markdown: string): Promise<InsertOutcome> => {
      blocks.push(markdown)
      return saveResult.ok
        ? { ok: true }
        : { ok: false, reason: 'failed', conflict: saveResult.conflict }
    }),
    save: vi.fn(async () => saveResult),
  }
  let open: InsertTarget | null = target
  const answer = vi.fn(async (_id: string): Promise<AnswerResult> => 'answered')
  const flow = new InsertFlow({ getTarget: () => open, answer })
  return {
    flow,
    target,
    blocks,
    answer,
    setSave: (r: typeof saveResult) => (saveResult = r),
    openNote: (t: InsertTarget | null) => (open = t),
  }
}

describe('넣기 → 저장 → 이해함 (Issue #43)', () => {
  it('저장되면 이해함을 한 번 보낸다', async () => {
    const { flow, answer, blocks } = setup()
    await expect(flow.insert('r1', '> 블록', 0, 'note-1')).resolves.toBe('answered')
    expect(blocks).toHaveLength(1)
    expect(answer).toHaveBeenCalledTimes(1)
    expect(flow.getPending().has('r1')).toBe(false)
  })

  describe('저장 실패(500 등) 뒤', () => {
    it('같은 카드를 다시 넣으려 하면 넣어지지 않는다 (블록이 두 번 들어가지 않는다)', async () => {
      const { flow, answer, blocks, setSave } = setup()
      setSave({ ok: false, conflict: false })
      await expect(flow.insert('r1', '> 블록', 0, 'note-1')).resolves.toBe('unsaved')
      expect(flow.getPending().get('r1')).toEqual({ kind: 'unsaved', noteId: 'note-1' })
      expect(flow.canInsert('r1')).toBe(false)

      setSave({ ok: true })
      await expect(flow.insert('r1', '> 블록', 0, 'note-1')).resolves.toBe('skipped')
      expect(blocks).toHaveLength(1)
      expect(answer).not.toHaveBeenCalled()
    })

    it('다시 시도 → 저장 성공 → 이해함이 정확히 한 번 나간다 (다시 넣지 않는다)', async () => {
      const { flow, target, answer, blocks, setSave } = setup()
      setSave({ ok: false, conflict: false })
      await flow.insert('r1', '> 블록', 0, 'note-1')

      setSave({ ok: true })
      await expect(flow.retry('r1')).resolves.toBe('answered')
      expect(target.save).toHaveBeenCalledTimes(1)
      expect(answer).toHaveBeenCalledTimes(1)
      expect(answer).toHaveBeenCalledWith('r1')
      expect(blocks).toHaveLength(1)
      expect(flow.getPending().has('r1')).toBe(false)
    })

    it('다시 시도 → 저장이 여전히 실패 → 이해함을 보내지 않고 그대로 둔다', async () => {
      const { flow, target, answer, setSave } = setup()
      setSave({ ok: false, conflict: false })
      await flow.insert('r1', '> 블록', 0, 'note-1')

      await expect(flow.retry('r1')).resolves.toBe('unsaved')
      expect(target.save).toHaveBeenCalledTimes(1)
      expect(answer).not.toHaveBeenCalled()
      expect(flow.getPending().get('r1')?.kind).toBe('unsaved')
      expect(flow.canInsert('r1')).toBe(false)
    })

    it('다시 시도할 때 넣은 노트가 열려 있지 않으면 저장을 확인하지 못해 보내지 않는다', async () => {
      const { flow, target, answer, setSave, openNote } = setup()
      setSave({ ok: false, conflict: false })
      await flow.insert('r1', '> 블록', 0, 'note-1')

      openNote({ ...target, noteId: 'note-2' })
      await expect(flow.retry('r1')).resolves.toBe('other-note')
      openNote(null)
      await expect(flow.retry('r1')).resolves.toBe('other-note')
      expect(answer).not.toHaveBeenCalled()
      expect(flow.getPending().get('r1')?.kind).toBe('unsaved')
    })

    it('다시 시도에서 충돌이면 이해함을 보내지 않고, 카드는 다시 넣을 수 있게 둔다', async () => {
      const { flow, answer, setSave } = setup()
      setSave({ ok: false, conflict: false })
      await flow.insert('r1', '> 블록', 0, 'note-1')

      setSave({ ok: false, conflict: true })
      await expect(flow.retry('r1')).resolves.toBe('conflict')
      expect(answer).not.toHaveBeenCalled()
      expect(flow.canInsert('r1')).toBe(true)
    })
  })

  it('저장 충돌(NOTE_CONFLICT)이면 이해함을 보내지 않고 카드를 막지 않는다', async () => {
    const { flow, answer, setSave } = setup()
    setSave({ ok: false, conflict: true })
    await expect(flow.insert('r1', '> 블록', 0, 'note-1')).resolves.toBe('conflict')
    expect(answer).not.toHaveBeenCalled()
    expect(flow.getPending().has('r1')).toBe(false)
    expect(flow.canInsert('r1')).toBe(true)
  })

  it('저장이 멈춰 있어 넣지 않으면(stuck) 아무것도 기억하지 않는다', async () => {
    const { flow, target, answer } = setup()
    vi.mocked(target.insert).mockResolvedValueOnce({ ok: false, reason: 'stuck' })
    await expect(flow.insert('r1', '> 블록', 0, 'note-1')).resolves.toBe('blocked')
    expect(answer).not.toHaveBeenCalled()
    expect(flow.canInsert('r1')).toBe(true)
  })

  it('이해함 실패 뒤: 다시 넣을 수 없고, 다시 시도는 저장 없이 이해함만 보낸다', async () => {
    const { flow, target, answer, blocks } = setup()
    answer.mockResolvedValueOnce('failed')
    await expect(flow.insert('r1', '> 블록', 0, 'note-1')).resolves.toBe('failed')
    expect(flow.getPending().get('r1')).toEqual({ kind: 'unanswered' })
    await expect(flow.insert('r1', '> 블록', 0, 'note-1')).resolves.toBe('skipped')

    await expect(flow.retry('r1')).resolves.toBe('answered')
    expect(target.save).not.toHaveBeenCalled()
    expect(answer).toHaveBeenCalledTimes(2)
    expect(blocks).toHaveLength(1)
  })

  it('넣는 중에는 같은 카드를 또 넣지 않는다', async () => {
    const { flow, blocks } = setup()
    const first = flow.insert('r1', '> 블록', 0, 'note-1')
    await expect(flow.insert('r1', '> 블록', 0, 'note-1')).resolves.toBe('skipped')
    await first
    expect(blocks).toHaveLength(1)
  })
})

describe('넣는 중에는 다른 답을 막는다 (known이 먼저 기록되지 않게)', () => {
  it('넣기·저장·이해함 보내기 동안 working이고, 끝나면 풀린다', async () => {
    const { flow, target, answer } = setup()
    let finishSave!: (o: InsertOutcome) => void
    vi.mocked(target.insert).mockReturnValueOnce(new Promise((r) => (finishSave = r)))
    let finishAnswer!: (r: AnswerResult) => void
    answer.mockReturnValueOnce(new Promise((r) => (finishAnswer = r)))

    const done = flow.insert('r1', '> 블록', 0, 'note-1')
    // 저장을 기다리는 중
    expect(flow.isWorking('r1')).toBe(true)
    finishSave({ ok: true })
    await vi.waitFor(() => expect(answer).toHaveBeenCalled())
    // 이해함을 보내는 중
    expect(flow.isWorking('r1')).toBe(true)
    finishAnswer('answered')
    await done
    expect(flow.isWorking('r1')).toBe(false)
    expect(flow.getPending().has('r1')).toBe(false)
  })

  it('다시 시도의 저장 중에도 working이고, 저장이 실패하면 저장 안 됨으로 돌아간다', async () => {
    const { flow, target, setSave } = setup()
    setSave({ ok: false, conflict: false })
    await flow.insert('r1', '> 블록', 0, 'note-1')
    expect(flow.isWorking('r1')).toBe(false)

    let finish!: (r: { ok: false; conflict: boolean }) => void
    vi.mocked(target.save).mockReturnValueOnce(new Promise((r) => (finish = r)))
    const done = flow.retry('r1')
    expect(flow.isWorking('r1')).toBe(true)
    // 진행 중에는 다시 시도도 겹치지 않는다
    await expect(flow.retry('r1')).resolves.toBe('skipped')
    finish({ ok: false, conflict: false })
    await expect(done).resolves.toBe('unsaved')
    expect(flow.getPending().get('r1')).toEqual({ kind: 'unsaved', noteId: 'note-1' })
  })
})

describe('카드는 그 추천 패널의 노트에만 넣는다', () => {
  it('열린 노트가 패널의 노트가 아니면 넣지 않는다', async () => {
    const { flow, target, answer, blocks } = setup()
    await expect(flow.insert('r1', '> 블록', 0, 'note-2')).resolves.toBe('wrong-note')
    await expect(flow.insert('r1', '> 블록', 0, null)).resolves.toBe('wrong-note')
    expect(target.insert).not.toHaveBeenCalled()
    expect(blocks).toHaveLength(0)
    expect(answer).not.toHaveBeenCalled()
    expect(flow.canInsert('r1')).toBe(true)
  })

  it('canInsertInto: 편집기가 있고 그 노트가 패널의 노트일 때만', () => {
    const { target } = setup()
    expect(canInsertInto(target, 'note-1')).toBe(true)
    expect(canInsertInto(target, 'note-2')).toBe(false)
    expect(canInsertInto(target, null)).toBe(false)
    expect(canInsertInto(null, 'note-1')).toBe(false)
  })
})
