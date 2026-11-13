import { isApiError, type AnalysisJob } from '../api'

/**
 * 팀 디버깅용 "분석 요청" 버튼을 보일지. 사용자 기능이 아니다.
 * 개발 서버(npm run dev)에서는 늘 보이고, 빌드에서는 VITE_DEBUG_ANALYSIS=true로 빌드했을 때만 보인다.
 * capabilities.analysisEnabled와 상관없다 (AI-off의 503 응답도 확인할 수 있게).
 */
export function isAnalysisDebugEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DEBUG_ANALYSIS === 'true'
}

/** 개발 서버에서만 콘솔에 남긴다 */
export function analysisDebugLog(...args: unknown[]) {
  if (import.meta.env.DEV) console.debug('[analysis-debug]', ...args)
}

export function analysisDebugSuccessMessage(job: AnalysisJob): string {
  return `분석 요청됨: job ${job.id.slice(0, 8)} · ${job.status} · v${job.noteVersion}`
}

/** 실패 문구. HTTP 상태가 아니라 error.code로 나눈다. */
export function analysisDebugErrorMessage(e: unknown): string {
  if (!isApiError(e)) return `분석 요청 실패: ${e instanceof Error ? e.message : String(e)}`
  switch (e.code) {
    case 'AI_UNAVAILABLE': {
      const reason = typeof e.details.reason === 'string' ? e.details.reason : '알 수 없음'
      return `분석 요청 실패: AI_UNAVAILABLE (reason: ${reason})`
    }
    case 'NOT_FOUND':
      return '분석 요청 실패: NOT_FOUND (노트가 없습니다)'
    case 'VALIDATION_FAILED':
      return `분석 요청 실패: VALIDATION_FAILED (${e.message})`
    case 'UNAUTHENTICATED':
      return '분석 요청 실패: UNAUTHENTICATED (다시 로그인하세요)'
    default:
      return `분석 요청 실패: ${e.code} (${e.message})`
  }
}
