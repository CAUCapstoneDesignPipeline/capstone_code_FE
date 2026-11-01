import { describe, expect, it } from 'vitest'
import type { Recommendation } from '../api'
import { remainingRecommendations } from './recommendations'

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
