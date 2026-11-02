import { request } from './client'
import type { components } from './schema.gen'

export function getCapabilities(signal?: AbortSignal) {
  return request<components['schemas']['Capabilities']>('GET', '/capabilities', {
    auth: false,
    signal,
  })
}

/** Only an explicit server boolean enables an existing feature. */
export function capabilityEnabled(value: unknown): boolean {
  return value === true
}
