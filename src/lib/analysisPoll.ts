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
  /**
   * jitter는 같은 작업(또는 같은 기다림)마다 한 번만 뽑는다. TanStack Query는 렌더할 때마다 간격을 다시 계산하고
   * 값이 바뀌면 타이머를 처음부터 다시 걸기 때문에, 매번 뽑으면 다시 그릴 때마다(자동 저장 등) 조회가 밀린다.
   */
  let current: { key: string; since: number; jitter: number } | null = null
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
    if (current?.key !== key) {
      current = { key, since: now(), jitter: Math.floor(random() * POLL.jitterMs) }
    }
    const elapsed = now() - current.since
    if (behind && elapsed >= POLL.giveUpMs) return false
    return elapsed < POLL.slowAfterMs ? POLL.fastMs : POLL.slowMs + current.jitter
  }
}
