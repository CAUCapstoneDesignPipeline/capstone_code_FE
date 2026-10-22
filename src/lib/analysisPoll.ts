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
 * 다음 조회까지 기다릴 시간(ms)을 돌려주는 함수를 만든다. false면 폴링을 멈춘다.
 * - 작업이 대기·진행 중이면 계속 조회한다.
 * - 작업이 끝났어도 저장한 version(savedVersion)보다 오래된 작업이면 BE가 새 작업을 만들 때까지
 *   giveUpMs 동안 더 조회한다 (BE는 debounce·admission 한도 때문에 저장 직후 작업을 만들지 않을 수 있다).
 * 느려지는 시점은 같은 작업(또는 같은 기다림)을 처음 본 때부터 잰다. 다른 작업 id로 바뀌면 다시 잰다.
 */
export function createAnalysisPoller(now = Date.now, random = Math.random) {
  let current: { key: string; since: number } | null = null
  return (job: AnalysisJob | null | undefined, savedVersion?: number): number | false => {
    const active = isAnalysisActive(job)
    const behind =
      !active &&
      job !== undefined &&
      savedVersion !== undefined &&
      savedVersion > (job?.noteVersion ?? 0)
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
