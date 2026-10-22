import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMockServer } from './server.mjs'

let server: ReturnType<typeof createMockServer>
let base: string
let token: string

/**
 * 저장 후 자동 분석은 테스트 안에서 시작되지 않을 만큼 늦추고(중간 상태를 확인할 수 있게),
 * 분석은 analyzeNow(명시적 요청)로 바로 돌린다.
 */
async function start(analysis: { fail?: boolean } = {}) {
  server = createMockServer({ analysis: { debounceMs: 10_000, runMs: 20, ...analysis } })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const res = await fetch(`${base}/auth/dev/token`, { method: 'POST' })
  token = ((await res.json()) as { accessToken: string }).accessToken
}

const stop = () => new Promise<void>((resolve) => server.close(() => resolve()))

beforeEach(() => start())
afterEach(stop)

async function call(method: string, path: string, body?: unknown, auth = true) {
  const headers: Record<string, string> = auth ? { Authorization: `Bearer ${token}` } : {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : undefined }
}

const errorCode = (r: { data: { error?: { code: string } } }) => r.data.error?.code

describe('주제', () => {
  it('처음에는 비어 있고 미분류 0', async () => {
    expect((await call('GET', '/topics')).data).toEqual({ topics: [], unassignedNoteCount: 0 })
  })

  it('만든 순서대로 sortOrder가 붙고, 같은 이름은 409 TOPIC_NAME_TAKEN', async () => {
    const a = await call('POST', '/topics', { name: ' 네트워크 ' })
    const b = await call('POST', '/topics', { name: 'DB' })
    expect(a.status).toBe(201)
    expect(a.data).toMatchObject({ name: '네트워크', sortOrder: 0, noteCount: 0 })
    expect(b.data.sortOrder).toBe(1)
    expect(errorCode(await call('POST', '/topics', { name: 'DB' }))).toBe('TOPIC_NAME_TAKEN')
    expect((await call('GET', '/topics')).data.topics.map((t: { name: string }) => t.name)).toEqual(
      ['네트워크', 'DB'],
    )
  })

  it("이름에 '/'가 있으면 VALIDATION_FAILED", async () => {
    const r = await call('POST', '/topics', { name: 'a/b' })
    expect(r.status).toBe(400)
    expect(r.data.error.details.fields).toEqual([{ field: 'name', reason: 'contains_slash' }])
  })

  it('/api 경로로도 받는다', async () => {
    expect((await call('GET', '/api/topics')).status).toBe(200)
  })
})

describe('로그인', () => {
  it('토큰이 없으면 401 UNAUTHENTICATED', async () => {
    const r = await call('GET', '/topics', undefined, false)
    expect(r.status).toBe(401)
    expect(errorCode(r)).toBe('UNAUTHENTICATED')
  })

  it('개발용 로그인 쿠키로 refresh하면 새 토큰을 받고, 쓴 refresh 토큰은 다시 못 쓴다', async () => {
    const login = await fetch(`${base}/auth/dev/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueRefreshCookie: true }),
    })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const first = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { cookie } })
    expect(first.status).toBe(200)
    expect(((await first.json()) as { user: { providers: string[] } }).user.providers).toEqual([
      'dev',
    ])
    const again = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { cookie } })
    expect(again.status).toBe(401)
  })
})

describe('주제 순서', () => {
  it('모든 id를 보내면 그 순서로 0부터 다시 매긴다', async () => {
    const a = (await call('POST', '/topics', { name: 'A' })).data
    const b = (await call('POST', '/topics', { name: 'B' })).data
    const r = await call('PUT', '/topics/order', { topicIds: [b.id, a.id] })
    expect(
      r.data.topics.map((t: { name: string; sortOrder: number }) => [t.name, t.sortOrder]),
    ).toEqual([
      ['B', 0],
      ['A', 1],
    ])
  })

  it('빠진 id가 있으면 409 TOPIC_ORDER_CONFLICT와 현재 목록', async () => {
    const a = (await call('POST', '/topics', { name: 'A' })).data
    await call('POST', '/topics', { name: 'B' })
    const r = await call('PUT', '/topics/order', { topicIds: [a.id] })
    expect(errorCode(r)).toBe('TOPIC_ORDER_CONFLICT')
    expect(r.data.error.details.current.topics).toHaveLength(2)
  })
})

describe('노트', () => {
  it('같은 주제 안에서만 제목이 유일하다', async () => {
    const net = (await call('POST', '/topics', { name: '네트워크' })).data
    const db = (await call('POST', '/topics', { name: 'DB' })).data
    const first = await call('POST', '/notes', { title: '재시도 정책', topicId: net.id })
    expect(first.status).toBe(201)
    expect(first.data).toMatchObject({ version: 0, body: '', topicId: net.id })
    expect(errorCode(await call('POST', '/notes', { title: '재시도 정책', topicId: net.id }))).toBe(
      'NOTE_TITLE_TAKEN',
    )
    expect((await call('POST', '/notes', { title: '재시도 정책', topicId: db.id })).status).toBe(
      201,
    )
    expect((await call('GET', '/topics')).data.topics[0].noteCount).toBe(1)
  })

  it('없는 주제에 만들면 404', async () => {
    const r = await call('POST', '/notes', {
      title: 'a',
      topicId: '00000000-0000-0000-0000-000000000000',
    })
    expect(errorCode(r)).toBe('NOT_FOUND')
  })

  it('수정하면 version이 오르고, 옛 version으로 저장하면 NOTE_CONFLICT와 현재 노트', async () => {
    const note = (await call('POST', '/notes', { title: '재시도 정책' })).data
    const a = await call('PUT', `/notes/${note.id}`, {
      title: '재시도 정책',
      body: 'A',
      version: 0,
    })
    expect(a.data.version).toBe(1)
    const b = await call('PUT', `/notes/${note.id}`, {
      title: '재시도 정책',
      body: 'B',
      version: 0,
    })
    expect(b.status).toBe(409)
    expect(b.data.error.code).toBe('NOTE_CONFLICT')
    expect(b.data.error.details.current).toMatchObject({ body: 'A', version: 1 })
  })

  it('지운 노트를 저장하면 NOT_FOUND', async () => {
    const note = (await call('POST', '/notes', { title: 'a' })).data
    expect((await call('DELETE', `/notes/${note.id}`)).status).toBe(204)
    const r = await call('PUT', `/notes/${note.id}`, { title: 'a', body: '', version: 0 })
    expect(errorCode(r)).toBe('NOT_FOUND')
  })

  it('이동해도 version은 그대로이고, 같은 제목이 있는 주제로는 옮기지 않는다', async () => {
    const db = (await call('POST', '/topics', { name: 'DB' })).data
    const note = (await call('POST', '/notes', { title: '인덱스' })).data
    await call('POST', '/notes', { title: '인덱스', topicId: db.id })
    expect(errorCode(await call('PUT', `/notes/${note.id}/topic`, { topicId: db.id }))).toBe(
      'NOTE_TITLE_TAKEN',
    )
    const other = (await call('POST', '/notes', { title: '샤딩' })).data
    await call('PUT', `/notes/${other.id}`, { title: '샤딩', body: 'x', version: 0 })
    const moved = await call('PUT', `/notes/${other.id}/topic`, { topicId: db.id })
    expect(moved.data).toMatchObject({ topicId: db.id, version: 1 })
  })

  it('검색: 제목·본문 부분 일치(대소문자 무시), 미분류만 보기', async () => {
    const net = (await call('POST', '/topics', { name: '네트워크' })).data
    await call('POST', '/notes', { title: '재시도 정책', topicId: net.id })
    await call('POST', '/notes', { title: '타임아웃', body: '실패하면 재시도한다. RETRY' })
    await call('POST', '/notes', { title: '인덱스' })

    const q = await call('GET', `/notes?q=${encodeURIComponent('재시도')}`)
    expect(q.data.notes.map((n: { title: string }) => n.title).sort()).toEqual(
      ['재시도 정책', '타임아웃'].sort(),
    )
    expect(q.data.notes.find((n: { title: string }) => n.title === '타임아웃').snippet).toContain(
      '재시도',
    )
    expect((await call('GET', '/notes?q=retry')).data.notes).toHaveLength(1)
    expect((await call('GET', '/notes?topicId=none')).data.notes).toHaveLength(2)
  })
})

describe('주제 삭제', () => {
  it('미분류에 같은 제목이 있으면 막고 겹치는 제목을 알려준다', async () => {
    const db = (await call('POST', '/topics', { name: 'DB' })).data
    await call('POST', '/notes', { title: '인덱스' })
    await call('POST', '/notes', { title: '인덱스', topicId: db.id })
    const r = await call('DELETE', `/topics/${db.id}`)
    expect(r.status).toBe(409)
    expect(r.data.error).toMatchObject({
      code: 'NOTE_TITLE_TAKEN',
      details: { titles: ['인덱스'] },
    })
  })

  it('겹치지 않으면 지우고 노트는 미분류로 옮긴다', async () => {
    const db = (await call('POST', '/topics', { name: 'DB' })).data
    await call('POST', '/notes', { title: '샤딩', topicId: db.id })
    expect((await call('DELETE', `/topics/${db.id}`)).status).toBe(204)
    expect((await call('GET', '/topics')).data).toEqual({ topics: [], unassignedNoteCount: 1 })
  })
})

async function noteWith(body: string, topicId: string | null = null) {
  const n = (await call('POST', '/notes', { title: '재시도 정책', topicId })).data
  return (await call('PUT', `/notes/${n.id}`, { title: n.title, body, version: 0 })).data
}

/** 명시적으로 분석을 요청하고 끝날 때까지 기다린다 */
async function analyzeNow(noteId: string) {
  await call('POST', `/notes/${noteId}/analysis`)
  return settledJob(noteId)
}

/** 가장 최근 작업이 끝날 때까지 기다린다 */
async function settledJob(noteId: string) {
  for (let i = 0; i < 100; i++) {
    const { job } = (await call('GET', `/notes/${noteId}/analysis`)).data
    if (job && (job.status === 'succeeded' || job.status === 'failed')) return job
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('분석이 끝나지 않았다')
}

describe('분석 작업 (draft)', () => {
  it('새로 만든 빈 노트는 분석한 적이 없다', async () => {
    const n = (await call('POST', '/notes', { title: '빈 노트' })).data
    expect((await call('GET', `/notes/${n.id}/analysis`)).data).toEqual({ job: null })
    expect((await call('GET', `/notes/${n.id}/graph`)).data).toEqual({
      noteId: n.id,
      analysis: null,
      concepts: [],
      relations: [],
    })
  })

  it('저장하면 pending이 생기고, 실행하면 running을 거쳐 succeeded', async () => {
    const n = await noteWith('**WAL**')
    const { job } = (await call('GET', `/notes/${n.id}/analysis`)).data
    expect(job).toMatchObject({ noteId: n.id, noteVersion: 1, status: 'pending', startedAt: null })
    const done = await analyzeNow(n.id)
    expect(done).toMatchObject({ id: job.id, status: 'succeeded', errorMessage: null })
    expect(done.startedAt).not.toBeNull()
  })

  it('연달아 저장하면 작업은 하나이고, 실행 전에 입력이 바뀌었으면 최신 version으로 새로 만든다', async () => {
    const n = await noteWith('**A**')
    const first = (await call('GET', `/notes/${n.id}/analysis`)).data.job
    await call('PUT', `/notes/${n.id}`, { title: n.title, body: '**A** **B**', version: 1 })
    expect((await call('GET', `/notes/${n.id}/analysis`)).data.job.id).toBe(first.id)
    // 실행 시점에 바뀐 입력을 보고 SUPERSEDED. 새 작업은 debounce를 기다린다.
    await call('POST', `/notes/${n.id}/analysis`)
    await new Promise((r) => setTimeout(r, 50))
    const next = (await call('GET', `/notes/${n.id}/analysis`)).data.job
    expect(next).toMatchObject({ noteVersion: 2, status: 'pending' })
    expect(next.id).not.toBe(first.id)
    expect(await analyzeNow(n.id)).toMatchObject({ id: next.id, status: 'succeeded' })
  })

  it('명시적 요청은 활성 작업이 있으면 그 작업을, 끝났으면 새 작업을 준다 (202)', async () => {
    const n = await noteWith('**A**')
    const active = (await call('GET', `/notes/${n.id}/analysis`)).data.job
    const r = await call('POST', `/notes/${n.id}/analysis`)
    expect(r.status).toBe(202)
    expect(r.data.id).toBe(active.id)
    await settledJob(n.id)
    const again = await call('POST', `/notes/${n.id}/analysis`)
    expect(again.data).toMatchObject({ status: 'pending', noteVersion: 1 })
    expect(again.data.id).not.toBe(active.id)
  })

  it('주제를 옮기면 version은 그대로지만 다시 분석하고, 근거의 주제가 바뀐다', async () => {
    const db = (await call('POST', '/topics', { name: 'DB' })).data
    const n = await noteWith('**A**와 **B**')
    await analyzeNow(n.id)
    await call('PUT', `/notes/${n.id}/topic`, { topicId: db.id })
    expect((await call('GET', `/notes/${n.id}/analysis`)).data.job).toMatchObject({
      noteVersion: 1,
      status: 'pending',
    })
    await analyzeNow(n.id)
    const g = (await call('GET', `/notes/${n.id}/graph`)).data
    expect(g.relations[0].evidence[0].topic).toEqual({ id: db.id, name: 'DB' })
  })

  it('AI 서버가 꺼져 있으면 failed와 오류 문구, 개념·관계는 비어 있다', async () => {
    await stop()
    await start({ fail: true })
    const n = await noteWith('**A**와 **B**')
    expect(await analyzeNow(n.id)).toMatchObject({
      status: 'failed',
      errorMessage: 'AI 서버에 연결하지 못했습니다.',
    })
    expect((await call('GET', `/notes/${n.id}/graph`)).data).toMatchObject({
      analysis: { status: 'failed' },
      concepts: [],
      relations: [],
    })
  })

  it('없는 노트는 404', async () => {
    const r = await call('GET', '/notes/00000000-0000-4000-8000-000000000999/analysis')
    expect(errorCode(r)).toBe('NOT_FOUND')
  })
})

describe('노트별 개념·관계 (draft)', () => {
  it('굵게 쓴 말이 개념이고, 한 문장의 개념끼리 관계가 되며 근거는 그 문장 (UTF-16 위치)', async () => {
    const topic = (await call('POST', '/topics', { name: '네트워크' })).data
    const body = '# 정리\n클라이언트는 **응답 시간 초과**가 되면 **재전송**한다. 끝.'
    const n = await noteWith(body, topic.id)
    await analyzeNow(n.id)
    const g = (await call('GET', `/notes/${n.id}/graph`)).data
    expect(g.analysis).toMatchObject({ noteId: n.id, noteVersion: 1, status: 'succeeded' })
    expect(g.concepts.map((c: { label: string }) => c.label)).toEqual(['응답 시간 초과', '재전송'])
    const m = g.concepts[1].mentions[0]
    expect(body.slice(m.startOffset, m.endOffset)).toBe('재전송')
    expect(g.relations).toHaveLength(1)
    const r = g.relations[0]
    expect(r).toMatchObject({
      source: { label: '응답 시간 초과' },
      target: { label: '재전송' },
      type: { code: 'causes', label: '원인' },
      origin: 'extracted',
      status: 'active',
    })
    expect(r.evidence[0]).toMatchObject({
      noteTitle: '재시도 정책',
      topic: { id: topic.id, name: '네트워크' },
      quote: '클라이언트는 **응답 시간 초과**가 되면 **재전송**한다.',
    })
    expect(body.slice(r.evidence[0].startOffset, r.evidence[0].endOffset)).toBe(r.evidence[0].quote)
  })

  it('결과는 마지막으로 성공한 분석의 것이고, 다시 저장해도 끝나기 전까지 그대로다', async () => {
    const n = await noteWith('**A**와 **B**')
    await analyzeNow(n.id)
    await call('PUT', `/notes/${n.id}`, { title: n.title, body: '없음', version: 1 })
    const g = (await call('GET', `/notes/${n.id}/graph`)).data
    expect(g.analysis.status).toBe('pending')
    expect(g.concepts).toHaveLength(2)
    await analyzeNow(n.id)
    expect((await call('GET', `/notes/${n.id}/graph`)).data.concepts).toEqual([])
  })

  it('별칭은 하나의 개념이고, 다시 불러와도 id가 같다', async () => {
    const n = await noteWith('**WAL**은 **Write Ahead Logging**과 같이 쓴다.')
    await analyzeNow(n.id)
    const a = (await call('GET', `/notes/${n.id}/graph`)).data
    const b = (await call('GET', `/notes/${n.id}/graph`)).data
    expect(a.concepts).toHaveLength(1)
    expect(a.concepts[0].mentions).toHaveLength(2)
    expect(a.relations).toEqual([])
    expect(b).toEqual(a)
  })
})
