// Galaxy 검색 결과로 가기 (FE #44, Figma W3-22g, 11/19 결정). 단계 상태(경로)와 캔버스 애니메이션을 차례로 부르는 절차.
// React·Cytoscape 없이 시험할 수 있게 하는 일은 모두 deps로 받는다 (GalaxyView가 넣는다).
// - 공통 경로는 그대로 두고, 필요한 만큼 위로는 한 번에(화면 전환 한 번) 올라간 뒤 한 단계씩 들어간다
// - 들어가는 단계마다: 다음 주제 노드 쪽으로 확대 애니메이션과 그 단계 데이터 받기를 함께 → 화면 전환 → 그려질 때까지 기다림
// - 중간 단계가 404(주제가 지워짐)면 멈추고 기존 404 처리(최상위로 + 안내)
// - prefers-reduced-motion이면 애니메이션 없이 단계 데이터만 차례로 받아 확인하고 바로 목표 단계로
// - 도착: 키워드면 그 노드 쪽으로 짧게 확대한 뒤 강조 + 문서 목록, 주제면 그 주제 안에서 멈춘다
import { galaxyRoute, type GalaxyPath } from './galaxy'
import { pathAfterLevelError } from './galaxyPath'

/** 들어가는 한 단계의 확대 애니메이션 시간 (ms). Figma 주석 "단계당 약 0.3~0.4초" */
export const GALAXY_SEARCH_STEP_MS = 350

export interface GalaxyTarget {
  /** 갈 단계 (searchTargetPath) */
  path: GalaxyPath
  /** 키워드 결과면 그 키워드 id (도착하면 강조 + 문서 목록). 주제 결과면 null */
  keywordId: string | null
}

export interface GalaxyNavigateDeps {
  /** 단계를 바꾼다 (화면 전환) */
  setPath: (path: GalaxyPath) => void
  /** 그 주제 단계의 데이터를 받아 둔다 (캐시가 있으면 바로). 실패는 ApiError로 던진다 */
  prefetch: (topicId: string, signal: AbortSignal) => Promise<unknown>
  /** 지금 단계에서 그 주제 노드 쪽으로 확대 애니메이션. 노드가 없으면 바로 끝난다 */
  zoomInto: (topicId: string, signal: AbortSignal) => Promise<void>
  /** 그 단계가 화면에 그려질 때까지 기다린다 */
  whenDrawn: (path: GalaxyPath, signal: AbortSignal) => Promise<void>
  /** 도착한 키워드 쪽으로 짧게 확대 (단계를 바꾸는 배율은 넘지 않는다). reduced-motion이면 부르지 않는다 */
  focusKeyword: (keywordId: string, signal: AbortSignal) => Promise<void>
  /** 도착한 키워드를 강조하고 문서 목록을 연다 */
  openKeyword: (keywordId: string) => void
  reducedMotion: boolean
}

/**
 * arrived: 목표에 도착. gone: 중간 단계가 없어져(404) 최상위로 돌아갔다 (부른 쪽이 안내).
 * failed: 그 밖의 오류로 그 단계에서 멈췄다 (그 단계의 오류 안내가 보인다). cancelled: 다른 결과를 골라 그만뒀다.
 */
export type GalaxyNavigateOutcome = 'arrived' | 'gone' | 'failed' | 'cancelled'

/** 받기 실패를 결과로 바꾼다. 404면 최상위로, 그 밖이면 그 단계로 가서 오류 안내를 보인다 */
function stopAt(deps: GalaxyNavigateDeps, path: GalaxyPath, error: unknown): GalaxyNavigateOutcome {
  const reset = pathAfterLevelError(error)
  if (reset) {
    deps.setPath(reset)
    return 'gone'
  }
  deps.setPath(path)
  return 'failed'
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** 지금 경로(from)에서 목표로 간다. signal이 끊기면(다른 결과를 고름) 그 자리에서 그만둔다 */
export async function runGalaxyRoute(
  from: GalaxyPath,
  target: GalaxyTarget,
  deps: GalaxyNavigateDeps,
  signal: AbortSignal,
): Promise<GalaxyNavigateOutcome> {
  const route = galaxyRoute(from, target.path)
  const lastId = (p: GalaxyPath) => p[p.length - 1].id
  /** 받기. 성공이면 null, 실패면 그 오류 */
  const fetchLevel = (p: GalaxyPath) =>
    deps.prefetch(lastId(p), signal).then(
      () => null,
      (e: unknown) => e ?? new Error('prefetch failed'),
    )

  try {
    if (deps.reducedMotion) {
      // 애니메이션 없이: 올라간 단계와 들어갈 단계를 차례로 확인하고 목표로 바로 간다
      const checks = route.ups > 0 && route.common.length > 0 ? [route.common] : []
      for (const p of [...checks, ...route.downs]) {
        const error = await fetchLevel(p)
        if (signal.aborted) return 'cancelled'
        if (error) return isAbort(error) ? 'cancelled' : stopAt(deps, p, error)
      }
      if (route.ups > 0 || route.downs.length > 0) {
        deps.setPath(target.path)
        await deps.whenDrawn(target.path, signal)
        if (signal.aborted) return 'cancelled'
      }
      if (target.keywordId) deps.openKeyword(target.keywordId)
      return 'arrived'
    }

    if (route.ups > 0) {
      if (route.common.length > 0) {
        const error = await fetchLevel(route.common)
        if (signal.aborted) return 'cancelled'
        if (error) return isAbort(error) ? 'cancelled' : stopAt(deps, route.common, error)
      }
      deps.setPath(route.common)
      await deps.whenDrawn(route.common, signal)
      if (signal.aborted) return 'cancelled'
    }

    for (const next of route.downs) {
      // 확대 애니메이션과 데이터 받기를 함께 (받기가 빠르면 애니메이션 시간만 걸린다)
      const [, error] = await Promise.all([deps.zoomInto(lastId(next), signal), fetchLevel(next)])
      if (signal.aborted) return 'cancelled'
      if (error) return isAbort(error) ? 'cancelled' : stopAt(deps, next, error)
      deps.setPath(next)
      await deps.whenDrawn(next, signal)
      if (signal.aborted) return 'cancelled'
    }

    if (target.keywordId) {
      await deps.focusKeyword(target.keywordId, signal)
      if (signal.aborted) return 'cancelled'
      deps.openKeyword(target.keywordId)
    }
    return 'arrived'
  } catch (e) {
    if (signal.aborted || isAbort(e)) return 'cancelled'
    throw e
  }
}

/** 사용자가 움직임을 줄여 달라고 했는지 (prefers-reduced-motion) */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}
