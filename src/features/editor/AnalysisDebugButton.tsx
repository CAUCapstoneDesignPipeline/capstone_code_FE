import type { AnalysisJob } from '../../api'
import { Button } from '../../components/Button'
import { useToast } from '../../components/toastContext'
import { useRequestNoteAnalysis } from '../../data/queries'
import { isAnalysisActive } from '../../lib/analysisPoll'
import { analysisDebugErrorMessage, analysisDebugSuccessMessage } from '../../lib/debug'

interface Props {
  noteId: string
  /** 지금 분석 작업. 대기·진행 중이면 누를 수 없다. */
  job?: AnalysisJob | null
}

/**
 * 팀 디버깅용 분석 요청 버튼 (사용자용 분석 버튼이 아니다). isAnalysisDebugEnabled()일 때만 그린다.
 * 저장을 강제하지 않는다. BE는 마지막으로 저장된 version을 분석한다.
 */
export function AnalysisDebugButton({ noteId, job }: Props) {
  const request = useRequestNoteAnalysis(noteId)
  const toast = useToast()
  return (
    <Button
      variant="ghost"
      size="compact"
      disabled={request.isPending || isAnalysisActive(job)}
      title="디버그: 저장된 내용 기준으로 분석을 요청합니다 (저장 안 된 입력은 포함되지 않음)"
      onClick={() =>
        request.mutate(undefined, {
          onSuccess: (created) => toast('info', analysisDebugSuccessMessage(created)),
          onError: (e) => toast('error', analysisDebugErrorMessage(e)),
        })
      }
    >
      분석 요청 (debug)
    </Button>
  )
}
