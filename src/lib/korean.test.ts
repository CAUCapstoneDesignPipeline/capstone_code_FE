import { describe, expect, it } from 'vitest'
import { josaWa, withRo } from './korean'

describe('withRo', () => {
  it('받침 없음 → 로, 받침 있음 → 으로, ㄹ 받침 → 로', () => {
    expect(withRo('네트워크')).toBe('네트워크로')
    expect(withRo('미분류')).toBe('미분류로')
    expect(withRo('운영체제 정리')).toBe('운영체제 정리로')
    expect(withRo('알고리즘')).toBe('알고리즘으로')
    expect(withRo('서울')).toBe('서울로')
  })

  it('한글로 끝나지 않으면 로', () => {
    expect(withRo('DB')).toBe('DB로')
  })
})

describe('josaWa', () => {
  it('받침 없음 → 와, 받침 있음 → 과, 한글이 아니면 와', () => {
    expect(josaWa('캐시')).toBe('와')
    expect(josaWa('재시도 정책')).toBe('과')
    expect(josaWa('RETRY')).toBe('와')
  })
})
