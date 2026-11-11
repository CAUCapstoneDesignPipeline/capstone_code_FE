import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGraph, setSession } from '.'

const BASE = 'http://api.test/api'

describe('GET /graph', () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', `${BASE}/`)
    vi.stubGlobal('fetch', fetchMock)
    setSession({ accessToken: 'tok', expiresIn: 900 } as never)
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ scope: 'all', nodes: [], edges: [] })),
    )
  })
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    setSession(null)
  })

  const urlOf = (i: number) => fetchMock.mock.calls[i][0]

  it('기본은 scope=all', async () => {
    await getGraph()
    expect(urlOf(0)).toBe(`${BASE}/graph?scope=all`)
  })

  it('scope=topic은 topicId를 함께 보낸다 (미분류는 none)', async () => {
    await getGraph({ scope: 'topic', topicId: 't-1' })
    await getGraph({ scope: 'topic', topicId: 'none' })
    expect(urlOf(0)).toBe(`${BASE}/graph?scope=topic&topicId=t-1`)
    expect(urlOf(1)).toBe(`${BASE}/graph?scope=topic&topicId=none`)
  })
})
