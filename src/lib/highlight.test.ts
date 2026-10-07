import { describe, expect, it } from 'vitest'
import { splitByQuery } from './highlight'

describe('splitByQuery', () => {
  it('검색어 부분을 모두 표시한다', () => {
    expect(splitByQuery('재시도 정책과 재시도 횟수', '재시도')).toEqual([
      { text: '재시도', match: true },
      { text: ' 정책과 ', match: false },
      { text: '재시도', match: true },
      { text: ' 횟수', match: false },
    ])
  })

  it('대소문자를 무시하고 원래 글자를 유지한다', () => {
    expect(splitByQuery('Retry와 RETRY', 'retry')).toEqual([
      { text: 'Retry', match: true },
      { text: '와 ', match: false },
      { text: 'RETRY', match: true },
    ])
  })

  it('정규식 특수문자도 글자 그대로 찾는다', () => {
    expect(splitByQuery('a.b axb', 'a.b')).toEqual([
      { text: 'a.b', match: true },
      { text: ' axb', match: false },
    ])
  })

  it('검색어가 비었거나 없으면 통째로 돌려준다', () => {
    expect(splitByQuery('본문', '  ')).toEqual([{ text: '본문', match: false }])
    expect(splitByQuery('본문', '없음')).toEqual([{ text: '본문', match: false }])
  })

  it('NFD로 들어온 글자도 찾는다', () => {
    expect(splitByQuery('재시도'.normalize('NFD'), '재시도')).toEqual([
      { text: '재시도', match: true },
    ])
  })
})
