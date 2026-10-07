import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { moveNoteErrorMessage } from './errorMessages'

describe('moveNoteErrorMessage', () => {
  it('NOTE_TITLE_TAKEN이면 겹치는 제목을 괄호로 붙인다 (W1-13)', () => {
    const e = new ApiError('NOTE_TITLE_TAKEN', '서버 문장', 409, { titles: ['재시도 정책'] })
    expect(moveNoteErrorMessage(e)).toBe(
      '옮길 주제에 같은 제목의 노트가 있어 옮기지 못했습니다. (재시도 정책)',
    )
  })

  it('겹치는 제목이 없으면 괄호 없이', () => {
    const e = new ApiError('NOTE_TITLE_TAKEN', '서버 문장', 409)
    expect(moveNoteErrorMessage(e)).toBe('옮길 주제에 같은 제목의 노트가 있어 옮기지 못했습니다.')
  })
})
