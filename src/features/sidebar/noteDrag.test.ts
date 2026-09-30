import { describe, expect, it } from 'vitest'
import { hasNoteDrag, NOTE_DRAG_TYPE, readNoteDrag, setNoteDrag } from './noteDrag'

function fakeDataTransfer() {
  const store = new Map<string, string>()
  return {
    setData: (type: string, value: string) => void store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    get types() {
      return [...store.keys()]
    },
  }
}

describe('noteDrag', () => {
  it('넣은 값을 그대로 읽는다 (미분류 포함)', () => {
    const dt = fakeDataTransfer()
    setNoteDrag(dt, { noteId: 'n1', fromTopicId: null })
    expect(hasNoteDrag(dt)).toBe(true)
    expect(readNoteDrag(dt)).toEqual({ noteId: 'n1', fromTopicId: null })
  })

  it('다른 곳에서 끌어온 것(파일, 글자)은 받지 않는다', () => {
    const dt = fakeDataTransfer()
    dt.setData('text/plain', '재시도')
    expect(hasNoteDrag(dt)).toBe(false)
    expect(readNoteDrag(dt)).toBeNull()
  })

  it('모양이 틀린 값은 null', () => {
    const dt = fakeDataTransfer()
    dt.setData(NOTE_DRAG_TYPE, '{"noteId":1}')
    expect(readNoteDrag(dt)).toBeNull()
  })
})
