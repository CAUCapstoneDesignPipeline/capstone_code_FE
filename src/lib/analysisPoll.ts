import type { AnalysisJob } from '../api'

/** docs/architecture/ai-communication.md: 2초 간격, 30초 뒤부터 5초 + 0~1초 jitter */
export const POLL = { fastMs: 2000, slowAfterMs: 30_000, slowMs: 5000, jitterMs: 1000 } as const

export function isAnalysisActive(job: AnalysisJob | null | undefined): boolean {
  return job?.status === 'pending' || job?.status === 'running'
}

/**
 * 다음 조회까지 기다릴 시간(ms)을 돌려주는 함수를 만든다. 작업이 끝났거나 없으면 false (폴링을 멈춘다).
 * 느려지는 시점은 그 작업을 처음 본 때부터 잰다. 다른 작업 id로 바뀌면 최신 작업을 따라 다시 잰다.
 */
export function createAnalysisPoller(now = Date.now, random = Math.random) {
  let current: { jobId: string; since: number } | null = null
  return (job: AnalysisJob | null | undefined): number | false => {
    if (!job || !isAnalysisActive(job)) {
      current = null
      return false
    }
    if (current?.jobId !== job.id) current = { jobId: job.id, since: now() }
    return now() - current.since < POLL.slowAfterMs
      ? POLL.fastMs
      : POLL.slowMs + Math.floor(random() * POLL.jitterMs)
  }
}
