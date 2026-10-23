import type { Capabilities } from '../api'

export const CAPABILITIES_OFF: Capabilities = {
  analysisEnabled: false,
  graphEnabled: false,
  discoveriesEnabled: false,
}

/**
 * 받은 기능 여부. 한 번 받은 값이 있으면 그 뒤 다시 받기에 실패해도 그 값을 쓴다 (잠깐의 오프라인으로 기능을 끄지 않는다).
 * 받은 적 없이 실패하면(경로가 없는 옛 서버 등) 모두 꺼진 것으로, 아직 받는 중이면 undefined.
 */
export function resolveCapabilities(
  data: Capabilities | undefined,
  isError: boolean,
): Capabilities | undefined {
  return data ?? (isError ? CAPABILITIES_OFF : undefined)
}
