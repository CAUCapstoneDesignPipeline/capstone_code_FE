import { describe, expect, it } from 'vitest'
import { toExternalLink } from './externalUrl'

describe('toExternalLink', () => {
  it('scheme·www.를 떼고 경로는 남긴다', () => {
    expect(toExternalLink('https://www.rfc-editor.org/rfc/rfc9110')).toEqual({
      href: 'https://www.rfc-editor.org/rfc/rfc9110',
      label: 'rfc-editor.org/rfc/rfc9110',
    })
  })

  it('끝 슬래시를 떼고 쿼리·해시는 남긴다', () => {
    expect(toExternalLink('http://example.com/')?.label).toBe('example.com')
    expect(toExternalLink('https://example.com/a?q=1#b')?.label).toBe('example.com/a?q=1#b')
  })

  it('앞뒤 공백은 무시한다', () => {
    expect(toExternalLink('  https://example.com/a ')?.href).toBe('https://example.com/a')
  })

  it('http·https가 아니면 링크로 만들지 않는다', () => {
    expect(toExternalLink('javascript:alert(1)')).toBeNull()
    expect(toExternalLink('ftp://example.com/a')).toBeNull()
  })

  it('URL이 아니면 null', () => {
    expect(toExternalLink('rfc-editor.org/rfc/rfc9110')).toBeNull()
    expect(toExternalLink('')).toBeNull()
  })
})
