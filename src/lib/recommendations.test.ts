import { describe, expect, it } from 'vitest'
import type { Recommendation } from '../api'
import { cardAfterAnswer, currentIndex, remainingRecommendations } from './recommendations'

const rec = (id: string) => ({ id }) as Recommendation

describe('remainingRecommendations', () => {
  it("'이해함'·'알고 있던 내용'은 빼고, '이해가 안 됨'과 답하지 않은 것은 순서대로 남긴다", () => {
    const list = [rec('a'), rec('b'), rec('c'), rec('d')]
    expect(
      remainingRecommendations(list, { a: 'understood', b: 'confused', c: 'known' }).map(
        (r) => r.id,
      ),
    ).toEqual(['b', 'd'])
  })

  it('모두 답하면 빈 배열', () => {
    expect(remainingRecommendations([rec('a')], { a: 'known' })).toEqual([])
  })
})

describe('보고 있는 카드', () => {
  const list = [rec('a'), rec('b'), rec('c')]

  it('id로 자리를 찾는다. 없으면 0', () => {
    expect(currentIndex(list, 'c')).toBe(2)
    expect(currentIndex(list, 'x')).toBe(0)
    expect(currentIndex(list, null)).toBe(0)
  })

  it('답하면 같은 자리에 오는 다음 카드, 마지막이면 앞 카드, 하나뿐이면 없음', () => {
    expect(cardAfterAnswer(list, 'a')).toBe('b')
    expect(cardAfterAnswer(list, 'c')).toBe('b')
    expect(cardAfterAnswer([rec('a')], 'a')).toBeNull()
  })

  it('앞의 카드가 실패로 돌아와도 보던 카드는 그대로, 개수만 는다', () => {
    // a에 답해 빠짐 → b를 보는 중 → a 전송 실패로 a가 원래 자리(맨 앞)에 돌아옴
    const after = [rec('b'), rec('c')]
    expect(after[currentIndex(after, 'b')].id).toBe('b')
    expect(list[currentIndex(list, 'b')].id).toBe('b')
    expect(currentIndex(list, 'b')).toBe(1)
  })
})
