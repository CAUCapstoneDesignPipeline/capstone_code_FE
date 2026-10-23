import { describe, expect, it } from 'vitest'
import { CAPABILITIES_OFF, resolveCapabilities } from './capabilities'

const ON = { analysisEnabled: true, graphEnabled: true, discoveriesEnabled: false }

describe('AI 기능 여부', () => {
  it('받는 중이면 undefined, 받은 적 없이 실패하면 모두 꺼짐', () => {
    expect(resolveCapabilities(undefined, false)).toBeUndefined()
    expect(resolveCapabilities(undefined, true)).toEqual(CAPABILITIES_OFF)
  })

  it('받은 값이 있으면 다시 받기에 실패해도 그 값을 쓴다', () => {
    expect(resolveCapabilities(ON, true)).toEqual(ON)
  })
})
