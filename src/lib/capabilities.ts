import type { Capabilities } from '../api'

export const CAPABILITIES_OFF: Capabilities = {
  analysisEnabled: false,
  graphEnabled: false,
  discoveriesEnabled: false,
}

/** 조회 실패·재조회 중에는 이전 허용 값을 사용하지 않는다. */
export function resolveCapabilities(
  data: Capabilities | undefined,
  isError: boolean,
  isFetching = false,
): Capabilities | undefined {
  if (isError || isFetching) return CAPABILITIES_OFF
  if (!data) return undefined
  return {
    analysisEnabled: data.analysisEnabled === true,
    graphEnabled: data.graphEnabled === true,
    discoveriesEnabled: data.discoveriesEnabled === true,
  }
}
