import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import { levelKeyOf, ROOT, type GalaxyPath } from './galaxy'
import { runGalaxyRoute, type GalaxyNavigateDeps, type GalaxyTarget } from './galaxyNavigate'

const net = { id: 'net', name: '네트워크' }
const transport = { id: 'transport', name: '전송 계층' }
const congestion = { id: 'congestion', name: '혼잡 제어' }
const reliability = { id: 'reliability', name: '신뢰성' }

/** 부른 차례를 적는 가짜. failOn: 그 주제를 받으면 던질 오류 */
function fake(options: { reducedMotion?: boolean; failOn?: Record<string, unknown> } = {}) {
  const log: string[] = []
  let path: GalaxyPath = ROOT
  const deps: GalaxyNavigateDeps = {
    setPath: (p) => {
      path = p
      log.push(`path ${levelKeyOf(p)}`)
    },
    prefetch: async (id) => {
      log.push(`fetch ${id}`)
      const error = options.failOn?.[id]
      if (error) throw error
    },
    zoomInto: async (id) => void log.push(`zoom ${id}`),
    whenDrawn: async (p) => void log.push(`drawn ${levelKeyOf(p)}`),
    focusKeyword: async (id) => void log.push(`focus ${id}`),
    openKeyword: (id) => void log.push(`open ${id}`),
    reducedMotion: options.reducedMotion ?? false,
  }
  return { deps, log, path: () => path }
}

const keywordAt = (path: GalaxyPath, keywordId = 'cwnd'): GalaxyTarget => ({ path, keywordId })
const run = (from: GalaxyPath, target: GalaxyTarget, deps: GalaxyNavigateDeps) =>
  runGalaxyRoute(from, target, deps, new AbortController().signal)

describe('검색 결과로 가기', () => {
  it('들어가는 단계마다: 다음 주제 쪽으로 확대·받기 → 화면 전환 → 그려질 때까지. 키워드면 확대 뒤 팝업', async () => {
    const f = fake()
    expect(await run(ROOT, keywordAt([net, transport]), f.deps)).toBe('arrived')
    expect(f.log).toEqual([
      'zoom net',
      'fetch net',
      'path net',
      'drawn net',
      'zoom transport',
      'fetch transport',
      'path net/transport',
      'drawn net/transport',
      'focus cwnd',
      'open cwnd',
    ])
  })

  it('갈래가 다르면 공통 경로까지 한 번에 올라간 뒤 들어간다', async () => {
    const f = fake()
    await run([net, transport, congestion], { path: [net, reliability], keywordId: null }, f.deps)
    expect(f.log).toEqual([
      'fetch net',
      'path net',
      'drawn net',
      'zoom reliability',
      'fetch reliability',
      'path net/reliability',
      'drawn net/reliability',
    ])
  })

  it('최상위로 올라갈 때는 받을 단계가 없다 (GraphView가 받아 둔 것)', async () => {
    const f = fake()
    await run([net, transport], { path: [], keywordId: null }, f.deps)
    expect(f.log).toEqual(['path root', 'drawn root'])
  })

  it('주제에 도착하면 그 안에서 멈춘다 (팝업 없음)', async () => {
    const f = fake()
    expect(await run(ROOT, { path: [net], keywordId: null }, f.deps)).toBe('arrived')
    expect(f.log.some((l) => l.startsWith('open') || l.startsWith('focus'))).toBe(false)
    expect(levelKeyOf(f.path())).toBe('net')
  })

  it('이미 그 단계면 단계는 그대로 두고 키워드만 확대·강조한다', async () => {
    const f = fake()
    await run([net], keywordAt([net], 'idem'), f.deps)
    expect(f.log).toEqual(['focus idem', 'open idem'])
  })
})

describe('중간 단계가 404면 멈춘다', () => {
  it('최상위로 돌아가고(기존 404 처리) 더 들어가지 않는다', async () => {
    const f = fake({ failOn: { transport: new ApiError('NOT_FOUND', '없음', 404) } })
    expect(await run(ROOT, keywordAt([net, transport, congestion]), f.deps)).toBe('gone')
    expect(f.path()).toEqual(ROOT)
    expect(f.log).not.toContain('zoom congestion')
    expect(f.log.some((l) => l.startsWith('open'))).toBe(false)
  })

  it('그 밖의 오류면 그 단계로 가서 멈춘다 (그 단계의 다시 시도 안내)', async () => {
    const f = fake({ failOn: { transport: new ApiError('NETWORK_ERROR', '연결 실패', 0) } })
    expect(await run(ROOT, keywordAt([net, transport, congestion]), f.deps)).toBe('failed')
    expect(levelKeyOf(f.path())).toBe('net/transport')
    expect(f.log).not.toContain('zoom congestion')
  })

  it('올라갈 공통 단계가 없어졌어도 최상위로', async () => {
    const f = fake({ failOn: { net: new ApiError('NOT_FOUND', '없음', 404) } })
    expect(await run([net, transport], { path: [net, reliability], keywordId: null }, f.deps)).toBe(
      'gone',
    )
    expect(f.path()).toEqual(ROOT)
  })
})

describe('prefers-reduced-motion', () => {
  it('애니메이션 없이 단계 데이터만 확인하고 한 번에 목표 단계로', async () => {
    const f = fake({ reducedMotion: true })
    expect(await run(ROOT, keywordAt([net, transport, congestion]), f.deps)).toBe('arrived')
    expect(f.log).toEqual([
      'fetch net',
      'fetch transport',
      'fetch congestion',
      'path net/transport/congestion',
      'drawn net/transport/congestion',
      'open cwnd',
    ])
  })

  it('중간 404면 최상위로 (화면 전환 없이 확인만 했으므로 목표로 가지 않는다)', async () => {
    const f = fake({
      reducedMotion: true,
      failOn: { transport: new ApiError('NOT_FOUND', '없음', 404) },
    })
    expect(await run(ROOT, keywordAt([net, transport, congestion]), f.deps)).toBe('gone')
    expect(f.log.filter((l) => l.startsWith('path'))).toEqual(['path root'])
  })
})

describe('다른 결과를 고르면 그만둔다', () => {
  it('끊긴 뒤로는 단계를 바꾸지 않는다', async () => {
    const f = fake()
    const controller = new AbortController()
    // 첫 단계 확대 중에 다른 결과를 골랐다
    f.deps.zoomInto = async (id) => {
      f.log.push(`zoom ${id}`)
      controller.abort()
    }
    const outcome = await runGalaxyRoute(
      ROOT,
      keywordAt([net, transport]),
      f.deps,
      controller.signal,
    )
    expect(outcome).toBe('cancelled')
    expect(f.log.filter((l) => l.startsWith('path'))).toEqual([])
  })
})
