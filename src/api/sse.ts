// text/event-stream(SSE) 읽기. 추천 챗봇이 POST라 EventSource를 쓸 수 없어 fetch 스트림을 직접 읽는다.
// https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation 중 이 앱에 필요한 것만:
// event·data 줄, 빈 줄로 이벤트 끝, ':'로 시작하는 주석 무시, CRLF·CR·LF 줄바꿈. id·retry는 쓰지 않는다.

export interface SseMessage {
  /** event: 줄의 값. 없으면 'message' */
  event: string
  /** data: 줄들을 줄바꿈으로 이은 값 */
  data: string
}

/**
 * 조각으로 오는 SSE 텍스트를 이벤트로 나눈다. push로 조각을 넣으면 그 조각까지로 끝난 이벤트들을 돌려준다.
 * 끝나지 않은 줄·이벤트는 다음 조각을 기다린다.
 */
export function createSseParser() {
  let buffer = ''
  let event = ''
  let data: string[] = []
  let hasData = false

  function line(text: string, out: SseMessage[]) {
    if (text === '') {
      if (hasData) out.push({ event: event || 'message', data: data.join('\n') })
      event = ''
      data = []
      hasData = false
      return
    }
    if (text.startsWith(':')) return
    const colon = text.indexOf(':')
    const field = colon < 0 ? text : text.slice(0, colon)
    let value = colon < 0 ? '' : text.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') {
      data.push(value)
      hasData = true
    }
  }

  return {
    push(chunk: string): SseMessage[] {
      buffer += chunk
      const out: SseMessage[] = []
      for (;;) {
        const m = /\r\n|\r|\n/.exec(buffer)
        // 조각이 \r로 끝나면 다음 조각이 \n으로 시작할 수 있어 기다린다
        if (!m || (m[0] === '\r' && m.index === buffer.length - 1)) break
        line(buffer.slice(0, m.index), out)
        buffer = buffer.slice(m.index + m[0].length)
      }
      return out
    },
  }
}

/** 응답 본문(바이트 스트림)을 SSE 이벤트로 하나씩 돌려준다. 스트림이 끝나면 멈춘다 (끝나지 않은 이벤트는 버린다) */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader()
  // 한 글자(UTF-8 여러 바이트)가 조각 사이에서 잘려도 이어 읽는다
  const decoder = new TextDecoder()
  const parser = createSseParser()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      yield* parser.push(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.releaseLock()
  }
}
