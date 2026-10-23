import type { AnalysisJob } from '../api'

/**
 * docs/architecture/ai-communication.md: 2초 간격, 30초 뒤부터 5초 + 0~1초 jitter.
 * giveUpMs: 저장한 version의 작업이 아직 안 보일 때 기다리는 한도 (BE debounce 최대 30초 + 여유)
 */
export const POLL = {
  fastMs: 2000,
  slowAfterMs: 30_000,
  slowMs: 5000,
  jitterMs: 1000,
  giveUpMs: 60_000,
} as const

export function isAnalysisActive(job: AnalysisJob | null | undefined): boolean {
  return job?.status === 'pending' || job?.status === 'running'
}

/**
 * 다음 조회까지 기다릴 시간(ms)을 돌려주는 함수를 만든다. false면 폴링을 멈춘다. 노트를 열 때마다 새로 만든다.
 * - 작업이 대기·진행 중이면 계속 조회한다.
 * - 작업이 끝났어도 저장한 version(savedVersion)보다 오래된 작업이면 BE가 새 작업을 만들 때까지
 *   giveUpMs 동안 더 조회한다 (BE는 debounce·admission 한도 때문에 저장 직후 작업을 만들지 않을 수 있다).
 * - 분석한 적이 없는 노트(job null)는 연 뒤에 저장했을 때만 첫 작업을 기다린다.
 *   열기만 해서는 기다리지 않는다 (분석한 적 없는 옛 노트를 열 때마다 폴링하지 않게).
 * 느려지는 시점은 같은 작업(또는 같은 기다림)을 처음 본 때부터 잰다. 다른 작업 id로 바뀌면 다시 잰다.
 */
export function createAnalysisPoller(now = Date.now, random = Math.random) {
  let current: { key: string; since: number } | null = null
  /** 노트를 열었을 때의 version */
  let openedVersion: number | undefined
  return (job: AnalysisJob | null | undefined, savedVersion?: number): number | false => {
    if (openedVersion === undefined) openedVersion = savedVersion
    const active = isAnalysisActive(job)
    const behind =
      !active &&
      savedVersion !== undefined &&
      (job
        ? savedVersion > job.noteVersion
        : job === null && openedVersion !== undefined && savedVersion > openedVersion)
    if (!active && !behind) {
      current = null
      return false
    }
    const key = active ? `job:${job!.id}` : `behind:${job?.id ?? 'none'}:${savedVersion}`
    if (current?.key !== key) current = { key, since: now() }
    const elapsed = now() - current.since
    if (behind && elapsed >= POLL.giveUpMs) return false
    return elapsed < POLL.slowAfterMs
      ? POLL.fastMs
      : POLL.slowMs + Math.floor(random() * POLL.jitterMs)
  }
}

/**
 * 폴링한 작업(job)과 받아 둔 그래프의 작업(shown)이 어긋났을 때 무엇을 다시 받을지.
 * 값은 effect의 키다: 같은 어긋남에는 한 번만 다시 받고, 어긋남이 바뀌면 또 받는다. null이면 받지 않는다.
 * - graph: 분석이 끝났는데 그래프가 그 작업의 결과가 아니면 그래프를 다시 받는다.
 * - analysis: 폴링이 멈췄는데 그래프가 다른 작업을 가리키면 분석 상태를 다시 받는다.
 *   그래프 쪽이 더 새 작업일 수 있다(다른 탭에서 저장 등). 어느 쪽이 최신인지는 GET /analysis가 정한다.
 * 진행 중이면 폴링이 따라잡으므로 아무것도 하지 않는다. 둘 중 하나라도 아직 불러오지 않았으면 기다린다.
 */
export function analysisMismatch(
  job: AnalysisJob | null | undefined,
  shown: AnalysisJob | null | undefined,
): { graph: string | null; analysis: string | null } {
  if (job === undefined || shown === undefined || isAnalysisActive(job)) {
    return { graph: null, analysis: null }
  }
  const pair = `${job?.id}:${job?.status}|${shown?.id}:${shown?.status}`
  return {
    graph: job && (shown?.id !== job.id || shown.status !== job.status) ? pair : null,
    analysis: shown && shown.id !== job?.id ? pair : null,
  }
}
