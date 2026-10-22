import type { AnalysisJob, AnalysisStatus } from '../../api'
import type { IconName } from '../../components/Icon'
import { StatusPill } from './StatusPill'

const VIEW: Record<AnalysisStatus, { label: string; icon: IconName; stuck: boolean }> = {
  pending: { label: '분석 대기', icon: 'dot', stuck: false },
  running: { label: '분석 중', icon: 'loader', stuck: false },
  succeeded: { label: '분석 완료', icon: 'check', stuck: false },
  failed: { label: '분석 실패', icon: 'alert', stuck: true },
}

/**
 * Figma AnalysisStatus: SaveStatus와 같은 모양. 분석 대기·분석 중·분석 완료는 ink-muted,
 * 분석 실패는 ink 테두리. 분석한 적이 없으면 보이지 않는다.
 */
export function AnalysisStatusIndicator({ job }: { job: AnalysisJob | null | undefined }) {
  if (!job) return null
  return (
    <StatusPill
      {...VIEW[job.status]}
      spinning={job.status === 'running'}
      status={job.status}
      title={job.status === 'failed' ? (job.errorMessage ?? undefined) : undefined}
    />
  )
}
