import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  conflictCurrent,
  createNote,
  deleteTopic,
  isApiError,
  listNotes,
  listTopics,
  onSessionChange,
  setSession,
  titleTakenTitles,
  type TokenResponse,
  updateNote,
  validationFields,
  type Note,
} from '.'

const BASE = 'http://api.test/api'

const note: Note = {
  id: '8a1d2f60-3c4b-4d8e-9f10-2b3c4d5e6f70',
  topicId: null,
  title: '재시도 정책',
  body: '본문',
  version: 4,
  createdAt: '2026-09-22T12:04:00Z',
  updatedAt: '2026-09-29T05:10:00Z',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', `${BASE}/`)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  setSession(null)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function catchError(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('실패해야 하는데 성공했습니다')
}

describe('요청', () => {
  it('주소 끝의 /를 떼고, 값이 없는 검색 조건은 보내지 않는다', async () => {
    fetchMock.mockResolvedValue(json(200, { notes: [] }))
    await listNotes({ q: '', sort: 'updated' })
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/notes?sort=updated`)
  })

  it('topicId가 null이면 미분류(none)로 보낸다', async () => {
    fetchMock.mockResolvedValue(json(200, { notes: [] }))
    await listNotes({ topicId: null, q: '재시도' })
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/notes?topicId=none&q=${encodeURIComponent('재시도')}`,
    )
  })

  it('본문은 JSON으로 보내고 응답 본문을 돌려준다', async () => {
    fetchMock.mockResolvedValue(json(201, note))
    await expect(createNote({ title: '재시도 정책' })).resolves.toEqual(note)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ title: '재시도 정책' })
  })

  it('204면 undefined를 돌려준다', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(deleteTopic('t1')).resolves.toBeUndefined()
  })
})

describe('오류', () => {
  it('NOTE_CONFLICT: 코드와 현재 노트를 꺼낼 수 있다', async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        error: { code: 'NOTE_CONFLICT', message: '먼저 수정됨', details: { current: note } },
      }),
    )
    const e = await catchError(updateNote(note.id, { title: 'a', body: 'b', version: 3 }))
    expect(isApiError(e, 'NOTE_CONFLICT')).toBe(true)
    expect(e.status).toBe(409)
    expect(e.message).toBe('먼저 수정됨')
    expect(conflictCurrent(e)).toEqual(note)
  })

  it('NOTE_TITLE_TAKEN: 겹치는 제목 목록을 꺼낼 수 있다', async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        error: { code: 'NOTE_TITLE_TAKEN', message: '삭제 불가', details: { titles: ['인덱스'] } },
      }),
    )
    const e = await catchError(deleteTopic('t1'))
    expect(titleTakenTitles(e)).toEqual(['인덱스'])
  })

  it('VALIDATION_FAILED: 필드별 이유를 꺼낼 수 있다', async () => {
    fetchMock.mockResolvedValue(
      json(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: "제목에는 '/'를 쓸 수 없습니다.",
          details: { fields: [{ field: 'title', reason: 'contains_slash' }] },
        },
      }),
    )
    const e = await catchError(createNote({ title: 'a/b' }))
    expect(validationFields(e)).toEqual([{ field: 'title', reason: 'contains_slash' }])
  })

  it('details가 없어도 꺼내는 함수는 빈 값을 돌려준다', async () => {
    fetchMock.mockResolvedValue(json(404, { error: { code: 'NOT_FOUND', message: '없음' } }))
    const e = await catchError(deleteTopic('t1'))
    expect(e.code).toBe('NOT_FOUND')
    expect(titleTakenTitles(e)).toEqual([])
    expect(conflictCurrent(e)).toBeUndefined()
    expect(validationFields(e)).toEqual([])
  })

  it('계약과 다른 오류 응답은 INTERNAL로 바꾼다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }))
    const e = await catchError(deleteTopic('t1'))
    expect(e.code).toBe('INTERNAL')
    expect(e.status).toBe(502)
    expect(warn).toHaveBeenCalled()
  })

  it('서버에 닿지 못하면 NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const e = await catchError(deleteTopic('t1'))
    expect(e.code).toBe('NETWORK_ERROR')
    expect(e.status).toBe(0)
  })

  it('시간 제한에 걸리면 NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'))
    const e = await catchError(deleteTopic('t1'))
    expect(e.code).toBe('NETWORK_ERROR')
    expect(e.message).toBe('서버가 응답하지 않습니다.')
  })

  it('모든 요청에 시간 제한 signal을 붙인다', async () => {
    fetchMock.mockImplementation(async () => json(200, { notes: [] }))
    await listNotes()
    await listNotes({}, new AbortController().signal)
    for (const [, init] of fetchMock.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('요청 취소는 ApiError로 바꾸지 않는다', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    await expect(listNotes()).rejects.toMatchObject({ name: 'AbortError' })
  })
})

const session = (accessToken: string): TokenResponse => ({
  accessToken,
  tokenType: 'Bearer',
  expiresIn: 1800,
  user: { id: 'u1', email: null, displayName: '개발자', providers: ['dev'] },
})

const unauthenticated = () =>
  json(401, { error: { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' } })

describe('로그인', () => {
  it('액세스 토큰을 Bearer로 붙이고, 쿠키는 보내지 않는다', async () => {
    setSession(session('t1'))
    fetchMock.mockResolvedValue(json(200, { topics: [], unassignedNoteCount: 0 }))
    await listTopics()
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer t1')
    expect(init.credentials).toBe('same-origin')
  })

  it('401이면 refresh(쿠키 포함)를 한 번 하고 새 토큰으로 다시 보낸다', async () => {
    setSession(session('old'))
    fetchMock
      .mockResolvedValueOnce(unauthenticated())
      .mockResolvedValueOnce(json(200, session('new')))
      .mockResolvedValueOnce(json(200, { topics: [], unassignedNoteCount: 0 }))
    await listTopics()
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1]
    expect(refreshUrl).toBe(`${BASE}/auth/refresh`)
    expect(refreshInit.credentials).toBe('include')
    expect(refreshInit.headers.Authorization).toBeUndefined()
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new')
  })

  it('동시에 401을 받아도 refresh는 한 번만 보낸다', async () => {
    setSession(session('old'))
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return json(200, session('new'))
      const auth = (init.headers as Record<string, string>).Authorization
      return auth === 'Bearer new' ? json(200, { notes: [] }) : unauthenticated()
    })
    await Promise.all([listNotes(), listNotes(), listNotes()])
    const refreshes = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))
    expect(refreshes).toHaveLength(1)
  })

  it('refresh도 401이면 로그인 만료를 알리고 UNAUTHENTICATED를 던진다', async () => {
    setSession(session('old'))
    const listener = vi.fn()
    const off = onSessionChange(listener)
    fetchMock.mockImplementation(async () => unauthenticated())
    const e = await catchError(listTopics())
    off()
    expect(e.code).toBe('UNAUTHENTICATED')
    expect(listener).toHaveBeenLastCalledWith(null)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
