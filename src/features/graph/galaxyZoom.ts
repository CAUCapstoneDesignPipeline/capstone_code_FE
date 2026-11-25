// Galaxy 그래프의 줌으로 단계 바꾸기를 언제 판단할지 (GalaxyCanvas가 쓴다). Cytoscape 없이 시험할 수 있게 나눴다.
// - 단계를 그리는 동안(배치·화면 맞추기)에는 판단하지 않는다. 맞추기가 내는 줌 이벤트로 단계가 바뀌지 않게
// - 단계가 바뀐 뒤 GALAXY_LEVEL_QUIET_MS 동안은 줌을 단계 판단에 쓰지 않는다 (같은 휠·트랙패드 관성으로 여러 단계가 넘어가지 않게).
//   그동안 줌이 바뀌면 기준 배율도 따라 옮겨, 조용한 시간이 끝난 뒤에는 거기서부터 다시 센다
// - 휠의 마우스 위치는 GALAXY_WHEEL_FRESH_MS 안의 것만 쓴다. 오래됐으면(− + 버튼·핀치 등) 화면 가운데 기준
// - 단계를 바꾸라고 한 번 알리면 새 단계를 그릴 때까지 다시 알리지 않는다
// - 검색 결과로 가는 동안(lock)은 줌·클릭으로 단계를 바꾸지 않는다. 풀린 뒤에도 조용한 시간을 둔다
import { GALAXY_LEVEL_ZOOM, type Point, type ZoomStep } from './galaxy'

/** 단계가 바뀐 뒤 줌 이벤트를 단계 판단에 쓰지 않는 시간 (ms). 실측 후 조정 */
export const GALAXY_LEVEL_QUIET_MS = 400
/** 휠의 마우스 위치를 줌 기준점으로 믿는 시간 (ms). 실측 후 조정 */
export const GALAXY_WHEEL_FRESH_MS = 300
/** 축소 한계를 위로 가는 기준(맞춘 배율 ÷ GALAXY_LEVEL_ZOOM)보다 이만큼 더 아래에 둔다 */
const MIN_ZOOM_MARGIN = 1.5
/** 확대 한계를 들어가는 기준(맞춘 배율 × GALAXY_LEVEL_ZOOM)보다 이만큼 더 위에 둔다 */
const MAX_ZOOM_MARGIN = 3
/** 맞춘 배율과 상관없이 이만큼까지는 확대할 수 있다 */
const MAX_ZOOM_FLOOR = 8

/**
 * 단계를 화면에 맞춘 배율(fitZoom)에 따른 줌 한계. 축소 한계는 위로 가는 기준(fitZoom ÷ 1.8)보다 항상 작아
 * 큰 단계(맞춘 배율이 아주 작음)에서도 줌 아웃으로 위로 갈 수 있다. 확대 한계는 들어가는 기준(fitZoom × 1.8)보다 항상 크다.
 */
export function zoomLimits(fitZoom: number): { min: number; max: number } {
  return {
    min: fitZoom / (GALAXY_LEVEL_ZOOM * MIN_ZOOM_MARGIN),
    max: Math.max(MAX_ZOOM_FLOOR, fitZoom * GALAXY_LEVEL_ZOOM * MAX_ZOOM_MARGIN),
  }
}

export class GalaxyZoomGate {
  private readonly now: () => number
  /** 지금 단계를 맞춘 배율(조용한 시간 동안은 따라 옮긴 배율). null이면 판단하지 않는다 */
  private base: number | null = null
  private quietUntil = 0
  /** 단계를 바꾸라고 알렸다. 새 단계를 그릴 때까지 다시 알리지 않는다 */
  private moving = false
  private wheel: { point: Point; at: number } | null = null
  /** 검색 결과로 가는 중 (galaxyNavigate.ts). 애니메이션의 줌으로도, 사용자의 줌·클릭으로도 단계를 바꾸지 않는다 */
  private locked = false

  constructor(now: () => number = () => performance.now()) {
    this.now = now
  }

  /** 배치·화면 맞추기를 시작한다. 끝날 때(drawn)까지 줌 이벤트를 판단에 쓰지 않는다 */
  pause() {
    this.base = null
  }

  /**
   * 단계를 그려 화면에 맞췄다. fitZoom이 새 기준이다. 새 단계면 단계 바꾸기 알림을 다시 받는다.
   * 같은 단계를 다시 배치했을 때도 조용한 시간을 둔다.
   */
  drawn(fitZoom: number, newLevel: boolean) {
    this.base = fitZoom
    this.quietUntil = this.now() + GALAXY_LEVEL_QUIET_MS
    if (newLevel) this.moving = false
  }

  /** 새 단계로 바뀌었지만 아직 그리지 않았다 (데이터를 받는 중) */
  levelChanged() {
    this.base = null
    this.moving = false
  }

  /** 휠 이벤트의 마우스 위치 (화면 좌표) */
  wheelAt(point: Point) {
    this.wheel = { point, at: this.now() }
  }

  /** − + 버튼: 휠 위치를 잊고 화면 가운데 기준으로 */
  forgetWheel() {
    this.wheel = null
  }

  /** 들어갈 주제를 고를 화면 좌표: 최근 휠이면 그 마우스 위치, 아니면 화면 가운데 */
  origin(center: Point): Point {
    const w = this.wheel
    return w && this.now() - w.at <= GALAXY_WHEEL_FRESH_MS ? w.point : center
  }

  /**
   * 줌 이벤트. 판단할 때면 decide(기준 배율)로 정하고, 단계를 바꾸면 그 뒤로는 새 단계까지 알리지 않는다.
   * 조용한 시간 동안은 판단하지 않고 기준을 지금 배율로 옮긴다.
   */
  onZoom(zoom: number, decide: (baseZoom: number) => ZoomStep): ZoomStep {
    if (this.base === null || this.moving || this.locked) return null
    if (this.now() < this.quietUntil) {
      this.base = zoom
      return null
    }
    const step = decide(this.base)
    if (step) this.moving = true
    return step
  }

  /** 클릭으로 단계를 바꾸려 한다. 이미 바꾸는 중이면 false */
  startMoving(): boolean {
    if (this.moving || this.locked) return false
    this.moving = true
    return true
  }

  /** 단계를 바꾸는 중인지 (빈 곳 클릭 등을 막는다) */
  isMoving(): boolean {
    return this.moving || this.locked
  }

  /** 검색 결과로 가기 시작. 끝날 때(unlock)까지 줌·클릭으로 단계를 바꾸지 않는다 */
  lock() {
    this.locked = true
  }

  /**
   * 검색 결과로 가기가 끝났다. 남은 줌 이벤트(애니메이션 끝·관성)로 단계가 바뀌지 않게 조용한 시간을 둔다.
   * 기준 배율은 그 단계를 맞춘 배율 그대로라 도착 확대(arrivalZoom)가 들어가는 기준을 넘지 않는다
   */
  unlock() {
    if (!this.locked) return
    this.locked = false
    this.quietUntil = this.now() + GALAXY_LEVEL_QUIET_MS
  }

  /** 지금 단계를 화면에 맞춘 배율 (도착 확대의 상한을 정할 때). 그리기 전이면 null */
  baseZoom(): number | null {
    return this.base
  }
}
