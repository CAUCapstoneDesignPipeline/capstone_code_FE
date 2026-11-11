import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, setSession, streamRecommendationChat, type RecommendationChatEvent } from '.'

const BASE = 'http://api.test/api'
const enc = new TextEncoder()

/** 조각을 하나씩 내보내는 응답 본문 */
function sseBody(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
}

const body = { conversationId: 'c-1', messages: [{ role: 'user' as const, content: '질문' }] }

async function collect(signal?: AbortSignal) {
  const out: RecommendationChatEvent[] = []
  for await (const e of streamRecommendationChat('rec-1', body, signal)) out.push(e)
  return out
}

describe('추천 챗봇 스트림', () => {
  const fetchMock = vi.fn<typeof fetch>()
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

  it('POST로 대화 전체를 보내고 SSE를 이벤트로 읽는다', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        sseBody([
          'event:start\ndata:{"conversationId":"c-1"}\n\nevent:delta\ndata:{"text":"같은"}\n\n',
          'event:delta\ndata:{"text":" 요청"}\n\nevent:done\ndata:{"stopReason":"end_turn"}\n\n',
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )
    expect(await collect()).toEqual([
      { type: 'start', conversationId: 'c-1' },
      { type: 'delta', text: '같은' },
      { type: 'delta', text: ' 요청' },
      { type: 'done', stopReason: 'end_turn' },
    ])
    const [url, init = {}] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/recommendations/rec-1/chat`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('done·error 없이 스트림이 끝나면 CHAT_INTERRUPTED로 알린다', async () => {
    fetchMock.mockResolvedValue(new Response(sseBody(['event:delta\ndata:{"text":"반"}\n\n'])))
    expect((await collect()).at(-1)).toMatchObject({
      type: 'error',
      code: 'CHAT_INTERRUPTED',
      retryable: true,
    })
  })

  it('첫 글자 전의 오류는 ApiError (413·503)', async () => {
    const error = (status: number, code: string) =>
      new Response(JSON.stringify({ error: { code, message: 'm' } }), { status })
    fetchMock.mockResolvedValueOnce(error(413, 'CHAT_INPUT_TOO_LARGE'))
    await expect(collect()).rejects.toMatchObject({ code: 'CHAT_INPUT_TOO_LARGE', status: 413 })
    fetchMock.mockResolvedValueOnce(error(503, 'AI_UNAVAILABLE'))
    const e = await collect().catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ code: 'AI_UNAVAILABLE' })
  })

  it('중지하면(signal) 연결을 끊고 AbortError를 던진다', async () => {
    const controller = new AbortController()
    // 실제 fetch처럼 signal이 끊기면 본문 스트림이 AbortError로 끝난다
    fetchMock.mockImplementation(async (_url, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode('event:delta\ndata:{"text":"a"}\n\n'))
          init?.signal?.addEventListener('abort', () =>
            c.error(new DOMException('aborted', 'AbortError')),
          )
        },
      })
      return new Response(stream)
    })
    const out: RecommendationChatEvent[] = []
    const run = (async () => {
      for await (const e of streamRecommendationChat('rec-1', body, controller.signal)) {
        out.push(e)
        controller.abort()
      }
    })()
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
    expect(out).toEqual([{ type: 'delta', text: 'a' }])
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })
})
