import { describe, expect, it } from 'vitest'
import type { Recommendation } from '../api'
import {
  viewingIndex,
  cardAfterAnswer,
  currentIndex,
  mergeRecommendations,
  newRecommendationsToast,
  remainingRecommendations,
  removeRecommendation,
  splitRecommendations,
} from './recommendations'

const rec = (id: string, conclusion = `${id} 결론`) => ({ id, conclusion }) as Recommendation
const ids = (list: readonly Recommendation[]) => list.map((r) => r.id)

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

describe('mergeRecommendations (11/04 회의)', () => {
  it('처음 받으면 BE 순서 그대로, 앞 5장만 보이고 나머지는 대기', () => {
    const incoming = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => rec(id))
    const { cards, added } = mergeRecommendations([], null, incoming, {})
    expect(ids(cards)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(added).toBe(7)
    const { visible, waiting } = splitRecommendations(cards, {})
    expect(ids(visible)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids(waiting)).toEqual(['f', 'g'])
  })

  it('같은 id는 내용만 새 것으로 바꾼다 (고정된 카드도, 뒤쪽 카드도)', () => {
    const before = [rec('a'), rec('b'), rec('c')]
    const { cards, added } = mergeRecommendations(
      before,
      'a',
      [rec('c', 'c 새 결론'), rec('a', 'a 새 결론')],
      {},
    )
    expect(cards.map((r) => r.conclusion)).toEqual(['a 새 결론', 'c 새 결론'])
    expect(added).toBe(0)
  })

  it('보고 있는 카드와 그 앞 카드는 자리와 순서를 그대로 두고, 새 결과에 없어도 남긴다', () => {
    const before = [rec('a'), rec('b'), rec('c'), rec('d')]
    // c를 보는 중. 새 결과는 순서가 바뀌었고 a·b가 없다
    const { cards } = mergeRecommendations(before, 'c', [rec('d'), rec('c'), rec('x')], {})
    expect(ids(cards)).toEqual(['a', 'b', 'c', 'd', 'x'])
  })

  it('뒤쪽은 새 결과의 BE 순서대로 다시 채운다', () => {
    const before = [rec('a'), rec('b'), rec('c'), rec('d')]
    const { cards } = mergeRecommendations(before, 'a', [rec('d'), rec('x'), rec('b')], {})
    expect(ids(cards)).toEqual(['a', 'd', 'x', 'b'])
  })

  it('새 결과에 없는 뒤쪽 카드는 뺀다 (대기 카드도)', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => rec(id))
    const { cards } = mergeRecommendations(before, 'a', [rec('b'), rec('e')], {})
    expect(ids(cards)).toEqual(['a', 'b', 'e'])
  })

  it("이미 답한 카드는 다시 넣지 않는다 ('이해가 안 됨'은 넣는다)", () => {
    const answers = { b: 'understood', c: 'known', d: 'confused' } as const
    const before = [rec('a'), rec('b'), rec('c'), rec('d')]
    const { cards } = mergeRecommendations(
      before,
      'a',
      [rec('b'), rec('c'), rec('d'), rec('x')],
      answers,
    )
    expect(ids(cards)).toEqual(['a', 'd', 'x'])
  })

  it('답해서 빠진 카드는 고정 범위를 셀 때 빼고 본다', () => {
    // a에 답해 빠짐 → b를 보는 중. 고정은 b까지 (a는 다시 넣지 않는다)
    const before = [rec('a'), rec('b'), rec('c')]
    const { cards } = mergeRecommendations(before, 'b', [rec('a'), rec('c')], { a: 'known' })
    expect(ids(cards)).toEqual(['b', 'c'])
  })

  it('같은 id가 두 번 들어가지 않는다', () => {
    const { cards } = mergeRecommendations(
      [rec('a'), rec('b')],
      'b',
      [rec('b'), rec('a'), rec('c'), rec('c')],
      {},
    )
    expect(ids(cards)).toEqual(['a', 'b', 'c'])
  })

  it('넘기지 않았으면(currentId 없음) 첫 카드를 보는 것으로 보고 그 카드만 고정한다', () => {
    const merged = mergeRecommendations(
      [rec('a'), rec('b')],
      null,
      [rec('x'), rec('b'), rec('a')],
      {},
    )
    expect(ids(merged.cards)).toEqual(['a', 'x', 'b'])
    expect(merged.currentId).toBe('a')
  })

  it('처음 받으면 첫 카드를 본다. 카드가 없으면 null', () => {
    expect(mergeRecommendations([], null, [rec('a'), rec('b')], {}).currentId).toBe('a')
    expect(mergeRecommendations([], null, [], {}).currentId).toBeNull()
  })

  it('offered: 답이 확정돼 넣지 않은 카드까지 센다 (모두 답했으면 W3-11)', () => {
    const merged = mergeRecommendations([], null, [rec('a'), rec('b')], {
      a: 'known',
      b: 'understood',
    })
    expect(merged.cards).toEqual([])
    expect(merged.offered).toBe(2)
    expect(mergeRecommendations([], null, [], {}).offered).toBe(0)
  })

  it('5장을 넘으면 대기하고, 답해서 빠지면 대기 카드가 끝에 붙는다', () => {
    const before = ['a', 'b', 'c'].map((id) => rec(id))
    const incoming = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => rec(id))
    const { cards } = mergeRecommendations(before, 'b', incoming, {})
    expect(ids(splitRecommendations(cards, {}).visible)).toEqual(['a', 'b', 'c', 'd', 'e'])

    const answered = { b: 'understood' } as const
    const after = splitRecommendations(cards, answered)
    expect(ids(after.visible)).toEqual(['a', 'c', 'd', 'e', 'f'])
    expect(ids(after.waiting)).toEqual(['g'])
    // 보이는 카드의 마지막에 답하면 그 자리에 붙는 대기 카드를 본다
    const all = [...after.visible, ...after.waiting]
    expect(cardAfterAnswer(all, 'f')).toBe('g')
  })

  it('새 추천 개수는 이전 목록(대기 포함)에 없던 id 수', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => rec(id))
    // f는 대기 중이던 카드라 새 추천이 아니다
    const { added } = mergeRecommendations(
      before,
      'a',
      [rec('f'), rec('x'), rec('y'), rec('b')],
      {},
    )
    expect(added).toBe(2)
    expect(mergeRecommendations(before, 'a', [rec('b')], {}).added).toBe(0)
    expect(newRecommendationsToast(2)).toBe('새 추천 2개')
  })

  describe('답을 전송하는 중에 합칠 때', () => {
    // a, b, c, d 중 b에 '이해함'을 눌러 전송 중 → 같은 자리에 온 c를 보는 중
    const before = ['a', 'b', 'c', 'd'].map((id) => rec(id))
    const sending = new Set(['b'])
    const answered = { b: 'understood' } as const
    const incoming = [rec('d'), rec('b', 'b 새 결론'), rec('x')]

    it('전송 중인 답의 카드는 덱에 남고, 화면에서는 숨긴다', () => {
      const { cards } = mergeRecommendations(before, 'c', incoming, answered, sending)
      expect(ids(cards)).toEqual(['a', 'b', 'c', 'd', 'x'])
      expect(ids(splitRecommendations(cards, answered).visible)).toEqual(['a', 'c', 'd', 'x'])
    })

    it('전송이 실패하면(답이 되돌려지면) 원래 자리로 돌아온다', () => {
      const { cards } = mergeRecommendations(before, 'c', incoming, answered, sending)
      const restored = splitRecommendations(cards, {}).visible
      expect(ids(restored)).toEqual(['a', 'b', 'c', 'd', 'x'])
      // 내용은 새 결과로 갱신되어 있다
      expect(restored[1].conclusion).toBe('b 새 결론')
      // 보던 카드는 그대로
      expect(restored[currentIndex(restored, 'c')].id).toBe('c')
    })

    it('전송이 성공하면 덱에서 빠지고, 다음에 합칠 때도 다시 들어오지 않는다', () => {
      const { cards } = mergeRecommendations(before, 'c', incoming, answered, sending)
      const after = removeRecommendation(cards, 'b')
      expect(ids(after)).toEqual(['a', 'c', 'd', 'x'])
      // 확정된 답(sending에 없음)은 새 결과에 있어도 넣지 않는다
      expect(ids(mergeRecommendations(after, 'c', incoming, answered).cards)).toEqual([
        'a',
        'c',
        'd',
        'x',
      ])
    })

    it('보고 있는 카드 뒤에 있던 전송 중 카드는 새 결과에 없어도 바로 뒤에 남는다', () => {
      // 마지막 카드 d에 답해 전송 중 → 앞 카드 c를 보는 중. 새 결과에 d가 없다
      const { cards } = mergeRecommendations(
        before,
        'c',
        [rec('x'), rec('a')],
        { d: 'known' },
        new Set(['d']),
      )
      expect(ids(cards)).toEqual(['a', 'b', 'c', 'd', 'x'])
      expect(ids(splitRecommendations(cards, {}).visible)).toEqual(['a', 'b', 'c', 'd', 'x'])
    })
  })

  it('합친 결과의 보고 있는 카드는 넘겨받은 카드 그대로다', () => {
    const merged = mergeRecommendations([rec('a'), rec('b')], 'b', [rec('x')], {})
    expect(merged.currentId).toBe('b')
  })
})

describe('viewingIndex', () => {
  const cards = ['1', '2', '3', '4', '5', '6'].map((id) => rec(id))

  it('보이는 카드면 그 자리, 없으면 0', () => {
    const { visible, waiting } = splitRecommendations(cards, {})
    expect(viewingIndex(visible, waiting, '3')).toBe(2)
    expect(viewingIndex(visible, waiting, 'x')).toBe(0)
    expect(viewingIndex(visible, waiting, null)).toBe(0)
  })

  it('마지막 카드에 답해 대기 카드로 넘어갔는데 전송이 실패하면, 첫 카드가 아니라 돌아온 카드를 본다', () => {
    // 5를 보다가 '이해함' → 패널은 답하기 전 목록(대기 포함)으로 다음 카드를 정한다 → 6이 끝에 붙어 6을 본다
    const shown = splitRecommendations(cards, {})
    const currentId = cardAfterAnswer([...shown.visible, ...shown.waiting], '5')
    expect(currentId).toBe('6')
    const answered = splitRecommendations(cards, { '5': 'understood' })
    expect(answered.visible[viewingIndex(answered.visible, answered.waiting, currentId)].id).toBe(
      '6',
    )
    // 전송 실패로 답이 되돌려짐 → 5가 제자리로, 6은 다시 대기
    const restored = splitRecommendations(cards, {})
    expect(ids(restored.waiting)).toEqual(['6'])
    expect(restored.visible[viewingIndex(restored.visible, restored.waiting, currentId)].id).toBe(
      '5',
    )
  })

  it('합칠 때도 같은 규칙으로 보고 있는 카드를 정해 고정한다', () => {
    // 위와 같은 상태(6을 보는 중인데 6이 대기)에서 합치면 5까지 고정
    const merged = mergeRecommendations(cards, '6', [rec('x')], {})
    expect(ids(merged.cards)).toEqual(['1', '2', '3', '4', '5', 'x'])
    expect(merged.currentId).toBe('5')
  })
})
