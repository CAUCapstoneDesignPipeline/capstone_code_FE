import { describe, expect, it } from 'vitest'
import {
  arrivalZoom,
  galaxyRoute,
  GALAXY_LEVEL_ZOOM,
  levelKeyOf,
  ROOT,
  searchKeyAction,
  searchResultMeta,
  searchTargetPath,
  type GalaxyPath,
} from './galaxy'

const net = { id: 'net', name: '네트워크' }
const transport = { id: 'transport', name: '전송 계층' }
const congestion = { id: 'congestion', name: '혼잡 제어' }
const reliability = { id: 'reliability', name: '신뢰성' }
const db = { id: 'db', name: 'DB' }
const ids = (paths: GalaxyPath[]) => paths.map(levelKeyOf)

describe('검색 결과의 목표 단계', () => {
  it('키워드면 바로 속한 주제, 주제면 그 주제 안', () => {
    expect(
      searchTargetPath({ kind: 'keyword', id: 'k', name: '혼잡 윈도우', path: [net, transport] }),
    ).toEqual([net, transport])
    expect(
      searchTargetPath({ kind: 'topic', id: 'transport', name: '전송 계층', path: [net] }),
    ).toEqual([net, transport])
    // 최상위 주제
    expect(searchTargetPath({ kind: 'topic', id: 'db', name: 'DB', path: [] })).toEqual([db])
  })
})

describe('경로 이동 계산 (공통 경로 · 위로 · 아래로)', () => {
  it('최상위에서 2단계 아래로: 한 단계씩 들어간다', () => {
    const r = galaxyRoute(ROOT, [net, transport, congestion])
    expect(r.ups).toBe(0)
    expect(r.common).toEqual([])
    expect(ids(r.downs)).toEqual(['net', 'net/transport', 'net/transport/congestion'])
  })

  it('공통 경로는 그대로 두고 그 아래만 들어간다', () => {
    const r = galaxyRoute([net], [net, transport, congestion])
    expect(r.ups).toBe(0)
    expect(ids(r.downs)).toEqual(['net/transport', 'net/transport/congestion'])
  })

  it('위로만: 목표가 지금 경로의 위면 들어가지 않는다', () => {
    const r = galaxyRoute([net, transport, congestion], [net])
    expect(r.ups).toBe(2)
    expect(r.common).toEqual([net])
    expect(r.downs).toEqual([])
  })

  it('갈래가 다르면 공통 경로까지 올라간 뒤 들어간다', () => {
    const r = galaxyRoute([net, transport, congestion], [net, reliability])
    expect(r.ups).toBe(2)
    expect(levelKeyOf(r.common)).toBe('net')
    expect(ids(r.downs)).toEqual(['net/reliability'])
  })

  it('공통 경로가 없으면 최상위까지 올라간다', () => {
    const r = galaxyRoute([net, transport], [db])
    expect(r.ups).toBe(2)
    expect(r.common).toEqual([])
    expect(ids(r.downs)).toEqual(['db'])
  })

  it('이미 목표 단계면 움직이지 않는다', () => {
    expect(galaxyRoute([net, transport], [net, transport])).toEqual({
      common: [net, transport],
      ups: 0,
      downs: [],
    })
  })

  it('미분류 키워드는 미분류 단계로', () => {
    const none = { id: 'none', name: '미분류' }
    expect(ids(galaxyRoute([net], [none]).downs)).toEqual(['none'])
  })

  it('id로 같은 칸을 본다 (이름이 바뀌었어도 공통 경로)', () => {
    const r = galaxyRoute([{ id: 'net', name: '옛 이름' }, transport], [net, reliability])
    expect(r.ups).toBe(1)
    expect(r.common).toEqual([net])
  })
})

describe('키워드 도착 확대', () => {
  it('지금 배율보다 크게, 하지만 단계를 바꾸는 배율(기준 × GALAXY_LEVEL_ZOOM)보다는 늘 작게', () => {
    for (const zoom of [1, 1.2, 1.5, 1.7]) {
      const z = arrivalZoom(zoom, 1)
      expect(z).toBeGreaterThanOrEqual(zoom)
      expect(z).toBeLessThan(GALAXY_LEVEL_ZOOM)
    }
    expect(arrivalZoom(1, 1)).toBeGreaterThan(1)
  })
})

describe('검색 결과 표시', () => {
  it('종류(◆) · 전체부터의 경로', () => {
    expect(searchResultMeta({ kind: 'keyword', origin: 'extracted', path: [net] })).toBe(
      '키워드 · 전체 › 네트워크',
    )
    expect(searchResultMeta({ kind: 'keyword', origin: 'generated', path: [net] })).toBe(
      '키워드 ◆ · 전체 › 네트워크',
    )
    expect(searchResultMeta({ kind: 'topic', origin: 'extracted', path: [] })).toBe('주제 · 전체')
    expect(
      searchResultMeta({ kind: 'keyword', origin: 'extracted', path: [{ id: 'none', name: '' }] }),
    ).toBe('키워드 · 전체 › 미분류')
  })
})

describe('검색창 키보드', () => {
  const open = { open: true, active: 0, count: 3 }
  it('↓↑로 결과를 옮기고 끝에서 처음으로 돈다', () => {
    expect(searchKeyAction('ArrowDown', open)).toEqual({ kind: 'move', active: 1 })
    expect(searchKeyAction('ArrowDown', { ...open, active: 2 })).toEqual({
      kind: 'move',
      active: 0,
    })
    expect(searchKeyAction('ArrowUp', open)).toEqual({ kind: 'move', active: 2 })
  })
  it('닫혀 있으면 ↓로 연다. 결과가 없으면 옮기지 않는다', () => {
    expect(searchKeyAction('ArrowDown', { ...open, open: false })).toEqual({ kind: 'open' })
    expect(searchKeyAction('ArrowDown', { open: true, active: -1, count: 0 })).toBeNull()
  })
  it('Enter로 고른 결과로 간다. 결과가 없으면 아무 일도 없다', () => {
    expect(searchKeyAction('Enter', { ...open, active: 1 })).toEqual({ kind: 'choose', index: 1 })
    expect(searchKeyAction('Enter', { open: true, active: -1, count: 0 })).toBeNull()
    expect(searchKeyAction('Enter', { ...open, open: false })).toBeNull()
  })
  it('Esc로 닫는다. 닫혀 있으면 넘긴다 (문서 목록 팝업이 닫히게)', () => {
    expect(searchKeyAction('Escape', open)).toEqual({ kind: 'close' })
    expect(searchKeyAction('Escape', { ...open, open: false })).toBeNull()
    expect(searchKeyAction('a', open)).toBeNull()
  })
})
