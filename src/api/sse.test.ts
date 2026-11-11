import { describe, expect, it } from 'vitest'
import { createSseParser, readSse } from './sse'

describe('SSE 읽기', () => {
  it('event·data 줄을 빈 줄에서 이벤트로 나눈다 (계약 예시)', () => {
    const p = createSseParser()
    const text =
      'event:start\ndata:{"conversationId":"c1"}\n\n' +
      'event:delta\ndata:{"text":"같은 요청을"}\n\n' +
      'event:done\ndata:{"stopReason":"end_turn"}\n\n'
    expect(p.push(text)).toEqual([
      { event: 'start', data: '{"conversationId":"c1"}' },
      { event: 'delta', data: '{"text":"같은 요청을"}' },
      { event: 'done', data: '{"stopReason":"end_turn"}' },
    ])
  })

  it('조각 경계가 줄·이벤트 가운데에 와도 이어 붙인다', () => {
    const p = createSseParser()
    expect(p.push('event: del')).toEqual([])
    expect(p.push('ta\r')).toEqual([])
    expect(p.push('\ndata: {"text":"a"}\r\n')).toEqual([])
    expect(p.push('\r\n')).toEqual([{ event: 'delta', data: '{"text":"a"}' }])
  })

  it('주석은 무시하고, data 여러 줄은 줄바꿈으로 잇고, event가 없으면 message', () => {
    const p = createSseParser()
    expect(p.push(': ping\n\ndata: a\ndata: b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }])
  })

  it('바이트 스트림을 읽는다 (한글이 조각 사이에서 잘려도)', async () => {
    const bytes = new TextEncoder().encode('event:delta\ndata:{"text":"한글"}\n\n')
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 25))
        c.enqueue(bytes.slice(25))
        c.close()
      },
    })
    const out = []
    for await (const m of readSse(body)) out.push(m)
    expect(out).toEqual([{ event: 'delta', data: '{"text":"한글"}' }])
  })
})
