import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { capabilityEnabled, getCapabilities, setSession } from '.'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  setSession(null)
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('reads the public AI-off capability without sending the session token', async () => {
  setSession({
    accessToken: 'synthetic',
    tokenType: 'Bearer',
    expiresIn: 1800,
    user: {
      id: 'fixture',
      displayName: 'fixture',
      email: null,
      providers: ['google'],
    },
  })
  const body = { analysisEnabled: false, graphEnabled: false, discoveriesEnabled: false }
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
  const result = await getCapabilities()
  expect(result).toEqual(body)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, options] = fetchMock.mock.calls[0]!
  expect(url).toBe('http://api.test/api/capabilities')
  expect(options.headers.Authorization).toBeUndefined()
  expect(capabilityEnabled(result.analysisEnabled)).toBe(false)
})

it('does not refresh authentication after a capability endpoint failure', async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'unavailable',
        },
      }),
      { status: 401 },
    ),
  )
  await expect(getCapabilities()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('fails closed for missing or malformed server fields', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ analysisEnabled: 'false' }), { status: 200 }),
  )
  const result = await getCapabilities()
  expect(capabilityEnabled(result.analysisEnabled)).toBe(false)
  expect(capabilityEnabled(result.graphEnabled)).toBe(false)
})
