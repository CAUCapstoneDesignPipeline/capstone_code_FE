import { describe, expect, it } from 'vitest'
import { circleImage } from './cytoscapeShared'

describe('원 그림 (페이지 점·추천 지식 점이 함께 씀, 리뷰 9)', () => {
  it('지름 size의 색 원 SVG data URI', () => {
    const uri = circleImage('rgb(1, 2, 3)', 12)
    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true)
    const svg = decodeURIComponent(uri.slice('data:image/svg+xml;utf8,'.length))
    expect(svg).toContain('width="12" height="12"')
    expect(svg).toContain('cx="6" cy="6" r="6" fill="rgb(1, 2, 3)"')
  })
})
