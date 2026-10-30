import { describe, expect, it } from 'vitest'
import { CAPABILITIES_OFF, resolveCapabilities } from './capabilities'

const ON = { analysisEnabled: true, graphEnabled: true, discoveriesEnabled: false }

describe('AI 기능 여부', () => {
  it('받는 중이면 undefined, 받은 적 없이 실패하면 모두 꺼짐', () => {
    expect(resolveCapabilities(undefined, false)).toBeUndefined()
    expect(resolveCapabilities(undefined, true)).toEqual(CAPABILITIES_OFF)
  })

  it('이전 허용 값이 있어도 실패하거나 재조회 중이면 모두 차단한다', () => {
    expect(resolveCapabilities(ON, true)).toEqual(CAPABILITIES_OFF)
    expect(resolveCapabilities(ON, false, true)).toEqual(CAPABILITIES_OFF)
    expect(resolveCapabilities(ON, false, false)).toEqual(ON)
  })
})
