import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGraph, isApiError, requestNoteAnalysis, setSession, type ApiError } from '.'

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

describe('POST /notes/{noteId}/analysis', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const job = {
    id: '0123456789abcdef',
    noteId: 'n 1',
    noteVersion: 3,
    status: 'pending',
    createdAt: '2026-11-13T00:00:00Z',
  }
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', `${BASE}/`)
    vi.stubGlobal('fetch', fetchMock)
    setSession({ accessToken: 'tok', expiresIn: 900 } as never)
  })
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    setSession(null)
  })

  it('POST로 보내고 202 body(AnalysisJob)를 감싸지 않고 그대로 돌려준다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(job), { status: 202 }))
    await expect(requestNoteAnalysis('n 1')).resolves.toEqual(job)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/notes/n%201/analysis`)
    expect(init?.method).toBe('POST')
  })

  it('503 AI_UNAVAILABLE은 code와 details.reason을 가진 ApiError다', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'AI_UNAVAILABLE', message: 'off', details: { reason: 'NOT_DEPLOYED' } },
        }),
        { status: 503 },
      ),
    )
    const e = await requestNoteAnalysis('n1').catch((x: unknown) => x)
    expect(isApiError(e, 'AI_UNAVAILABLE')).toBe(true)
    expect((e as ApiError).details.reason).toBe('NOT_DEPLOYED')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
