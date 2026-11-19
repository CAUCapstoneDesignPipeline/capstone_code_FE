import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note, NoteUpdate } from '../../api'
import { createRecommendTrigger, RECOMMEND_MAX_INTERVAL_MS } from '../../data/recommendTrigger'
import { insertionAt } from '../../lib/insertedKnowledge'
import { NoteSaver } from './noteSaver'
import {
  blockBefore,
  blockBoundaries,
  insertedRecommendation,
  isInsertedRecommendation,
  routeBodyChange,
} from './recommendDrop'

const stateOf = (doc: string) =>
  EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })

/** 자리마다 그 뒤 글의 앞부분 (알아보기 쉽게) */
const at = (doc: string) => blockBoundaries(stateOf(doc)).map((p) => doc.slice(p, p + 4))

describe('블록 사이 자리', () => {
  it('맨 위 블록마다 그 앞, 그리고 문서 끝', () => {
    const doc = '첫 문단\n\n## 제목\n본문\n\n끝'
    expect(at(doc)).toEqual(['첫 문단', '## 제', '본문\n\n', '끝', ''])
  })

  it('목록·표·코드·인용은 한 덩어리라 그 안에는 자리가 없다', () => {
    const doc = [
      '- 하나',
      '- 둘',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '```',
      '코드',
      '```',
      '',
      '> 인용 첫 줄',
      '> 인용 둘째 줄',
    ].join('\n')
    expect(at(doc)).toEqual(['- 하나', '| a ', '```\n', '> 인용', ''])
  })

  it('빈 문서는 처음 한 자리', () => {
    expect(blockBoundaries(stateOf(''))).toEqual([0])
  })

  it('자리 앞 블록의 첫 줄 (기호를 뺀 글). 맨 앞이면 null', () => {
    const doc = '## 재시도 조건\n\n- 응답 타임아웃\n- 둘째\n\n끝'
    const state = stateOf(doc)
    const [first, afterHeading, afterList] = blockBoundaries(state)
    expect(blockBefore(state, first)).toBeNull()
    expect(blockBefore(state, afterHeading)).toBe('재시도 조건')
    expect(blockBefore(state, afterList)).toBe('응답 타임아웃')
  })
})

describe('넣기는 입력이 아니다 (분석 트리거 제외, Issue #43)', () => {
  it('넣은 변경에는 표시가 붙고, 입력에는 붙지 않는다', () => {
    const state = stateOf('본문')
    const inserted = state.update({
      changes: insertionAt('본문', 2, '> 넣은 것'),
      annotations: insertedRecommendation.of(true),
    })
    const typed = state.update({ changes: { from: 2, insert: '!' } })
    expect(isInsertedRecommendation([inserted])).toBe(true)
    expect(isInsertedRecommendation([typed])).toBe(false)
  })

  describe('저장 · 추천 트리거와 함께', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const note: Note = {
      id: 'n1',
      topicId: null,
      title: '재시도 정책',
      body: '본문',
      version: 1,
      createdAt: '2026-11-18T00:00:00Z',
      updatedAt: '2026-11-18T00:00:00Z',
    }

    function setup() {
      const request = vi.fn<(noteId: string) => Promise<void>>().mockResolvedValue(undefined)
      const trigger = createRecommendTrigger({ request, enabled: () => true })
      const save = vi.fn(async (_id: string, input: NoteUpdate) => ({
        ...note,
        ...input,
        version: input.version + 1,
      }))
      const saver: NoteSaver = new NoteSaver(note, {
        save,
        onSaved: (saved) => trigger.onSaved(saved.id, saved.version),
      })
      // NoteEditor와 같은 연결: 입력은 저장과 트리거에, 넣기는 저장에만
      const change = (body: string, inserted: boolean) =>
        routeBodyChange(body, inserted, {
          input: (b) => {
            saver.edit({ body: b })
            trigger.onInput(note.id, saver)
          },
          save: (b) => saver.edit({ body: b }),
        })
      return { request, save, saver, change }
    }

    it('끌어다 놓은 저장만으로는 분석 요청이 나가지 않는다', async () => {
      const { request, save, saver, change } = setup()
      change('본문\n\n> 넣은 것', true)
      await expect(saver.saveNow()).resolves.toEqual({ ok: true, version: 2 })
      expect(save).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(RECOMMEND_MAX_INTERVAL_MS * 2)
      expect(request).not.toHaveBeenCalled()
    })

    it('사용자의 입력은 지금처럼 분석을 요청한다', async () => {
      const { request, change } = setup()
      change('본문!', false)
      await vi.advanceTimersByTimeAsync(RECOMMEND_MAX_INTERVAL_MS)
      expect(request).toHaveBeenCalledTimes(1)
    })
  })
})
