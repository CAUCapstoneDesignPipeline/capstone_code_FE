import { describe, expect, it } from 'vitest'
import { GALAXY_LEVEL_ZOOM, type ZoomStep } from './galaxy'
import {
  GALAXY_LEVEL_QUIET_MS,
  GALAXY_WHEEL_FRESH_MS,
  GalaxyZoomGate,
  zoomLimits,
} from './galaxyZoom'

/** 시계를 손으로 움직이는 문 */
function setup() {
  let t = 0
  const gate = new GalaxyZoomGate(() => t)
  const tick = (ms: number) => (t += ms)
  /** 기준의 1.8배 이상이면 들어가는 판단 */
  const enterAtZoom = (zoom: number) =>
    gate.onZoom(zoom, (base): ZoomStep =>
      zoom >= base * GALAXY_LEVEL_ZOOM ? { kind: 'enter', topicId: 't' } : null,
    )
  return { gate, tick, enterAtZoom }
}

describe('맞추기의 줌 이벤트로 단계가 바뀌지 않는다 (리뷰 1)', () => {
  it('배치·맞추기 중(pause ~ drawn)의 줌 이벤트는 판단하지 않는다', () => {
    const { gate, tick, enterAtZoom } = setup()
    gate.drawn(1, true)
    tick(GALAXY_LEVEL_QUIET_MS + 1)
    // 같은 단계를 다시 받아 노드가 늘었다: 다시 맞추면 배율이 크게 바뀐다
    gate.pause()
    expect(enterAtZoom(5)).toBeNull()
    expect(enterAtZoom(0.1)).toBeNull()
    gate.drawn(0.5, false)
    tick(GALAXY_LEVEL_QUIET_MS + 1)
    // 새 기준(0.5)에서 센다
    expect(enterAtZoom(0.8)).toBeNull()
    expect(enterAtZoom(0.5 * GALAXY_LEVEL_ZOOM)).toEqual({ kind: 'enter', topicId: 't' })
  })
})

describe('단계가 바뀐 뒤 잠깐은 줌을 단계 판단에 쓰지 않는다 (리뷰 4)', () => {
  it('조용한 시간 동안의 줌(관성)은 무시하고 기준만 따라 옮긴다', () => {
    const { gate, tick, enterAtZoom } = setup()
    gate.drawn(1, true)
    tick(GALAXY_LEVEL_QUIET_MS - 100)
    // 같은 휠 동작의 관성이 계속 확대한다
    expect(enterAtZoom(2)).toBeNull()
    expect(enterAtZoom(3)).toBeNull()
    tick(200)
    // 조용한 시간이 끝난 뒤에는 마지막 배율(3)에서부터 다시 센다
    expect(enterAtZoom(3.5)).toBeNull()
    expect(enterAtZoom(3 * GALAXY_LEVEL_ZOOM)).toEqual({ kind: 'enter', topicId: 't' })
  })

  it('한 번 단계를 바꾸라고 하면 새 단계를 그릴 때까지 다시 알리지 않는다', () => {
    const { gate, tick, enterAtZoom } = setup()
    gate.drawn(1, true)
    tick(GALAXY_LEVEL_QUIET_MS + 1)
    expect(enterAtZoom(2)).not.toBeNull()
    expect(enterAtZoom(4)).toBeNull()
    expect(gate.startMoving()).toBe(false)
    gate.levelChanged()
    gate.drawn(1, true)
    tick(GALAXY_LEVEL_QUIET_MS + 1)
    expect(gate.startMoving()).toBe(true)
  })
})

describe('휠 위치는 최근 것만 (리뷰 5)', () => {
  const center = { x: 500, y: 300 }
  it('최근 휠이면 그 마우스 위치, 오래됐거나(핀치 등) 버튼을 눌렀으면 화면 가운데', () => {
    const { gate, tick } = setup()
    expect(gate.origin(center)).toEqual(center)
    gate.wheelAt({ x: 900, y: 100 })
    tick(GALAXY_WHEEL_FRESH_MS)
    expect(gate.origin(center)).toEqual({ x: 900, y: 100 })
    tick(1)
    expect(gate.origin(center)).toEqual(center)
    gate.wheelAt({ x: 900, y: 100 })
    gate.forgetWheel()
    expect(gate.origin(center)).toEqual(center)
  })
})

describe('줌 한계는 맞춘 배율 기준 (리뷰 6)', () => {
  it('축소 한계는 위로 가는 기준보다 항상 작고, 확대 한계는 들어가는 기준보다 항상 크다', () => {
    for (const fit of [0.001, 0.03, 0.07, 0.5, 1, 1.2, 10]) {
      const { min, max } = zoomLimits(fit)
      expect(min).toBeLessThan(fit / GALAXY_LEVEL_ZOOM)
      expect(max).toBeGreaterThan(fit * GALAXY_LEVEL_ZOOM)
    }
  })

  it('큰 단계(맞춘 배율 0.07)에서도 위로 가는 기준까지 축소할 수 있다 (예전 고정 한계 0.05로는 못 감)', () => {
    const fit = 0.07
    expect(fit / GALAXY_LEVEL_ZOOM).toBeLessThan(0.05)
    expect(zoomLimits(fit).min).toBeLessThan(fit / GALAXY_LEVEL_ZOOM)
  })
})

describe('검색 결과로 가는 동안(lock) 입력을 무시한다', () => {
  it('잠긴 동안은 줌으로도 클릭으로도 단계를 바꾸지 않는다', () => {
    const { gate, tick, enterAtZoom } = setup()
    gate.drawn(1, true)
    tick(GALAXY_LEVEL_QUIET_MS + 1)
    gate.lock()
    // 애니메이션(또는 사용자)의 확대가 들어가는 기준을 넘어도
    expect(enterAtZoom(GALAXY_LEVEL_ZOOM * 2)).toBeNull()
    expect(gate.startMoving()).toBe(false)
    // 빈 곳 클릭도 막는다
    expect(gate.isMoving()).toBe(true)
  })

  it('잠긴 동안의 줌은 기준 배율을 옮기지 않는다 (도착 확대가 기준을 넘지 않게)', () => {
    const { gate } = setup()
    gate.drawn(1, true)
    gate.lock()
    gate.onZoom(1.4, () => null)
    expect(gate.baseZoom()).toBe(1)
  })

  it('풀린 뒤에도 조용한 시간 동안은 판단하지 않고, 그 뒤로는 다시 판단한다', () => {
    const { gate, tick, enterAtZoom } = setup()
    gate.drawn(1, true)
    tick(GALAXY_LEVEL_QUIET_MS + 1)
    gate.lock()
    gate.unlock()
    expect(enterAtZoom(1.4)).toBeNull()
    expect(gate.isMoving()).toBe(false)
    tick(GALAXY_LEVEL_QUIET_MS + 1)
    expect(enterAtZoom(1.4 * GALAXY_LEVEL_ZOOM)).toEqual({ kind: 'enter', topicId: 't' })
  })
})
