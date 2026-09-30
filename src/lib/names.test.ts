import { describe, expect, it } from 'vitest'
import { checkName, nextUntitledTitle } from './names'

describe('checkName', () => {
  it('규칙에 맞으면 null', () => {
    expect(checkName('  네트워크 ', '주제 이름', 50)).toBeNull()
  })

  it('비었거나 공백뿐이면 입력 요청', () => {
    expect(checkName('   ', '주제 이름', 50)).toBe('주제 이름을 입력하세요.')
  })

  it("'/'를 막는다", () => {
    expect(checkName('a/b', '제목', 200)).toBe("제목에는 '/'를 쓸 수 없습니다.")
  })

  it('길이는 앞뒤 공백을 뺀 글자 수로 센다', () => {
    expect(checkName(` ${'가'.repeat(50)} `, '주제 이름', 50)).toBeNull()
    expect(checkName('가'.repeat(51), '주제 이름', 50)).toBe('주제 이름은 50자까지 쓸 수 있습니다.')
  })
})

describe('nextUntitledTitle', () => {
  it('겹치지 않는 가장 앞 번호를 고른다', () => {
    expect(nextUntitledTitle([])).toBe('제목 없음')
    expect(nextUntitledTitle(['제목 없음'])).toBe('제목 없음 1')
    expect(nextUntitledTitle(['제목 없음', '제목 없음 2'])).toBe('제목 없음 1')
    expect(nextUntitledTitle(['제목 없음', '제목 없음 1'])).toBe('제목 없음 2')
  })

  it('NFD로 들어온 제목도 같은 제목으로 본다', () => {
    expect(nextUntitledTitle(['제목 없음'.normalize('NFD')])).toBe('제목 없음 1')
  })
})
