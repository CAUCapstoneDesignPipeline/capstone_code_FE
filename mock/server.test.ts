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
async function start(
  analysis: {
    fail?: boolean
    off?: boolean
    externalKnowledge?: boolean
    chatOff?: boolean
  } = {},
) {
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

describe('페이지 그래프 (v0.4.0-draft · W3-13)', () => {
  it('노드는 모든 페이지, 같은 개념을 쓴 두 페이지는 선 1개(공유 키워드 포함)', async () => {
    const net = (await call('POST', '/topics', { name: '네트워크' })).data
    const db = (await call('POST', '/topics', { name: 'DB' })).data
    const a = (await call('POST', '/notes', { title: '재시도', topicId: net.id })).data
    await call('PUT', `/notes/${a.id}`, {
      title: '재시도',
      body: '**재전송**은 **중복 실행**이 되면 위험하다. **중복 행**도 생긴다.',
      version: 0,
    })
    const b = (await call('POST', '/notes', { title: '멱등성', topicId: db.id })).data
    await call('PUT', `/notes/${b.id}`, {
      title: '멱등성',
      body: '**중복 실행**은 **중복 행**을 만들기 때문.',
      version: 0,
    })
    const lonely = (await call('POST', '/notes', { title: '외톨이', topicId: null })).data
    await analyzeNow(a.id)
    await analyzeNow(b.id)

    const g = (await call('GET', '/graph')).data
    expect(g.scope).toBe('all')
    expect(g.nodes).toEqual(
      expect.arrayContaining([
        { id: a.id, title: '재시도', topicId: net.id },
        { id: b.id, title: '멱등성', topicId: db.id },
        { id: lonely.id, title: '외톨이', topicId: null },
      ]),
    )
    // 공유 키워드가 둘이어도 선은 하나
    expect(g.edges).toEqual([
      { sourceId: a.id, targetId: b.id, sharedKeywords: ['중복 실행', '중복 행'] },
    ])

    const topic = (await call('GET', `/graph?scope=topic&topicId=${db.id}`)).data
    expect(topic.nodes).toEqual([{ id: b.id, title: '멱등성', topicId: db.id }])
    expect(topic.edges).toEqual([])

    // 미분류(none)와 없는 주제(404)
    const none = (await call('GET', '/graph?scope=topic&topicId=none')).data
    expect(none.nodes).toEqual([{ id: lonely.id, title: '외톨이', topicId: null }])
    const missing = await call(
      'GET',
      '/graph?scope=topic&topicId=8a1d2f60-3c4b-4d8e-9f10-2b3c4d5e6f70',
    )
    expect(missing.status).toBe(404)
    expect(errorCode(missing)).toBe('NOT_FOUND')
  })

  it('scope가 틀리거나 필요한 id가 없으면 400 (scope=note는 v0.4에서 뺐다)', async () => {
    expect(errorCode(await call('GET', '/graph?scope=x'))).toBe('VALIDATION_FAILED')
    expect(errorCode(await call('GET', '/graph?scope=note'))).toBe('VALIDATION_FAILED')
    expect(errorCode(await call('GET', '/graph?scope=topic'))).toBe('VALIDATION_FAILED')
  })
})

describe('추천 (v0.4.0-draft)', () => {
  async function settledRecommendation(jobId: string) {
    for (let i = 0; i < 100; i++) {
      const job = (await call('GET', `/recommendation-jobs/${jobId}`)).data
      if (job.status === 'completed') return job
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error('추천 작업이 끝나지 않음')
  }

  it('같은 키워드를 쓴 다른 노트가 있으면 근거 A·B(원문 위치 포함)로 추천한다', async () => {
    const a = (await call('POST', '/notes', { title: '재시도 정책' })).data
    const bodyA = '# 재시도\n클라이언트는 **재전송**한다.'
    await call('PUT', `/notes/${a.id}`, { title: '재시도 정책', body: bodyA, version: 0 })
    const b = (await call('POST', '/notes', { title: '멱등성' })).data
    const bodyB = '**재전송**해도 결과가 같다.'
    await call('PUT', `/notes/${b.id}`, { title: '멱등성', body: bodyB, version: 0 })

    const created = await call('POST', `/notes/${a.id}/recommendation-jobs`)
    expect(created.status).toBe(202)
    expect(created.data).toMatchObject({
      noteId: a.id,
      status: 'pending',
      outcome: null,
      recommendations: [],
    })
    // 끝나기 전에 다시 요청하면 같은 작업
    expect((await call('POST', `/notes/${a.id}/recommendation-jobs`)).data.id).toBe(created.data.id)

    const job = await settledRecommendation(created.data.id)
    expect(job.outcome).toBe('RECOMMENDED')
    expect(job.recommendations).toHaveLength(1)
    const [r] = job.recommendations
    expect(r).toMatchObject({ revision: 1, freshness: 'current' })
    expect(r.evidenceA).toEqual({
      noteId: a.id,
      noteTitle: '재시도 정책',
      noteVersion: 1,
      startOffset: bodyA.indexOf('클라이언트'),
      endOffset: bodyA.length,
      quote: '클라이언트는 **재전송**한다.',
    })
    expect(r.evidenceB).toMatchObject({ noteId: b.id, startOffset: 0, quote: bodyB })
    expect(r.relatedKeywords).toEqual(['재전송'])
    // 지금 AI는 외부 지식을 만들지 않는다 (AI #19)
    expect(r.externalKnowledge).toBeNull()
  })

  it('--external-knowledge면 예시 외부 지식을 준다', async () => {
    await stop()
    await start({ externalKnowledge: true })
    const a = (await call('POST', '/notes', { title: 'A', body: '**공유**한다.' })).data
    await call('POST', '/notes', { title: 'B', body: '**공유**된다.' })
    const created = await call('POST', `/notes/${a.id}/recommendation-jobs`)
    const [r] = (await settledRecommendation(created.data.id)).recommendations
    expect(r.externalKnowledge.sourceUrl).toMatch(/^https:/)
  })

  it('--fail-analysis면 추천 작업은 RECOMMENDATION_FAILED + 빈 배열로 끝난다', async () => {
    await stop()
    await start({ fail: true })
    const a = (await call('POST', '/notes', { title: 'A', body: '**공유**한다.' })).data
    await call('POST', '/notes', { title: 'B', body: '**공유**된다.' })
    const created = await call('POST', `/notes/${a.id}/recommendation-jobs`)
    const job = await settledRecommendation(created.data.id)
    expect(job).toMatchObject({ outcome: 'RECOMMENDATION_FAILED', recommendations: [] })
  })

  it('추천 카드에 답하면 204, 잘못된 답은 400, 없는 추천은 404', async () => {
    const a = (await call('POST', '/notes', { title: 'A', body: '**공유**한다.' })).data
    await call('POST', '/notes', { title: 'B', body: '**공유**된다.' })
    const created = await call('POST', `/notes/${a.id}/recommendation-jobs`)
    const [r] = (await settledRecommendation(created.data.id)).recommendations
    const send = (action: string) => call('POST', `/recommendations/${r.id}/feedback`, { action })
    // confused 뒤 최종 답은 204, 같은 답 재전송도 204
    expect((await send('confused')).status).toBe(204)
    expect((await send('known')).status).toBe(204)
    expect((await send('known')).status).toBe(204)
    // 최종 답 뒤 다른 답은 409 REVIEW_CONFLICT
    for (const other of ['understood', 'confused']) {
      const conflict = await send(other)
      expect(conflict.status).toBe(409)
      expect(errorCode(conflict)).toBe('REVIEW_CONFLICT')
    }
    expect(
      errorCode(await call('POST', `/recommendations/${r.id}/feedback`, { action: 'nope' })),
    ).toBe('VALIDATION_FAILED')
    expect((await call('POST', '/recommendations/nope/feedback', { action: 'known' })).status).toBe(
      404,
    )
  })

  it('다시 분석하면 같은 추천은 같은 id(결론은 조금 바뀜), 그대로인 카드 하나는 빠지고, 새 id가 더해진다', async () => {
    const a = (await call('POST', '/notes', { title: 'A', body: '**가** **나** **다** **라**' }))
      .data
    await call('POST', '/notes', { title: 'B', body: '**가** **나** **다** **라**' })
    type Rec = { id: string; conclusion: string; freshness: string; revision: number }
    const run = async () =>
      (
        await settledRecommendation(
          (await call('POST', `/notes/${a.id}/recommendation-jobs`)).data.id,
        )
      ).recommendations as Rec[]
    const first = await run()
    expect(first).toHaveLength(4)
    expect(first.every((r) => r.freshness === 'current' && r.revision === 1)).toBe(true)
    const firstIds = first.map((r) => r.id)

    const second = await run()
    const kept = second.filter((r) => firstIds.includes(r.id))
    expect(kept).toHaveLength(3)
    expect(kept.every((r) => r.conclusion.includes('2번째 분석'))).toBe(true)
    expect(second.filter((r) => !firstIds.includes(r.id))).toHaveLength(3)

    // 2회차 역할: stale · evidence_lost · 새 revision의 current · 그대로(빠짐)
    const byId = new Map(second.map((r) => [r.id, r]))
    const stale = byId.get(firstIds[0])!
    const lost = byId.get(firstIds[1])!
    const revised = byId.get(firstIds[2])!
    expect(stale.freshness).toBe('stale')
    expect(lost.freshness).toBe('evidence_lost')
    expect(revised).toMatchObject({ freshness: 'current', revision: 2 })
    expect(byId.has(firstIds[3])).toBe(false)

    // current가 아닌 추천에 답하면 409, current면 204 (같은 id로 다시 와도 답을 받는다)
    const feedback = (id: string) =>
      call('POST', `/recommendations/${id}/feedback`, { action: 'known' })
    for (const blocked of [stale, lost]) {
      const conflict = await feedback(blocked.id)
      expect(conflict.status).toBe(409)
      expect(errorCode(conflict)).toBe('RECOMMENDATION_STALE')
    }
    expect((await feedback(revised.id)).status).toBe(204)
  })

  it('stale이던 추천은 다음 회차에 같은 id의 새 revision(current)으로 온다', async () => {
    const a = (await call('POST', '/notes', { title: 'A', body: '**가** **나** **다** **라**' }))
      .data
    await call('POST', '/notes', { title: 'B', body: '**가** **나** **다** **라**' })
    const run = async () =>
      (
        await settledRecommendation(
          (await call('POST', `/notes/${a.id}/recommendation-jobs`)).data.id,
        )
      ).recommendations as { id: string; freshness: string; revision: number }[]
    await run()
    const second = await run()
    const third = await run()
    const staleIds = second.filter((r) => r.freshness === 'stale').map((r) => r.id)
    expect(staleIds.length).toBeGreaterThan(0)
    for (const id of staleIds) {
      expect(third.find((r) => r.id === id)).toMatchObject({ freshness: 'current', revision: 2 })
    }
  })

  it('이어질 노트가 없으면 NO_RECOMMENDATIONS + 빈 배열, 없는 작업·노트는 404', async () => {
    const a = (await call('POST', '/notes', { title: '혼자', body: '**외톨이**' })).data
    const created = await call('POST', `/notes/${a.id}/recommendation-jobs`)
    expect(await settledRecommendation(created.data.id)).toMatchObject({
      outcome: 'NO_RECOMMENDATIONS',
      recommendations: [],
    })
    expect((await call('GET', '/recommendation-jobs/nope')).status).toBe(404)
    expect((await call('POST', '/notes/nope/recommendation-jobs')).status).toBe(404)
  })
})

describe('추천 챗봇 (SSE, docs PR #22)', () => {
  async function card() {
    const a = (await call('POST', '/notes', { title: 'A', body: '**공유**한다.' })).data
    await call('POST', '/notes', { title: 'B', body: '**공유**된다.' })
    const created = await call('POST', `/notes/${a.id}/recommendation-jobs`)
    for (let i = 0; i < 100; i++) {
      const job = (await call('GET', `/recommendation-jobs/${created.data.id}`)).data
      if (job.status === 'completed') return job.recommendations[0] as { id: string }
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error('추천 작업이 끝나지 않음')
  }
  const chat = async (id: string, body: unknown) => {
    const res = await fetch(`${base}/recommendations/${id}/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, type: res.headers.get('content-type'), text }
  }
  /** SSE 본문 → [event, data] */
  const events = (text: string) =>
    text
      .split('\n\n')
      .filter(Boolean)
      .map((block) => {
        const [e, d] = block.split('\n')
        return [e.replace('event:', ''), JSON.parse(d.replace('data:', ''))] as const
      })

  it('start · delta… · done 순서로 보내고, conversationId를 돌려준다', async () => {
    const r = await card()
    const res = await chat(r.id, {
      conversationId: 'c-1',
      messages: [{ role: 'user', content: '쉽게 풀어 줘' }],
    })
    expect(res.status).toBe(200)
    expect(res.type).toMatch(/^text\/event-stream/)
    const list = events(res.text)
    expect(list[0]).toEqual(['start', { conversationId: 'c-1' }])
    expect(list.at(-1)).toEqual(['done', { stopReason: 'end_turn' }])
    const deltas = list.filter(([e]) => e === 'delta')
    expect(deltas.length).toBeGreaterThan(1)
  })

  it("'끊김'이 든 질문은 글 몇 조각 뒤 CHAT_INTERRUPTED error 이벤트로 끝난다", async () => {
    const r = await card()
    const list = events((await chat(r.id, { messages: [{ role: 'user', content: '끊김' }] })).text)
    expect(list.at(-1)).toEqual([
      'error',
      { code: 'CHAT_INTERRUPTED', message: '답변이 중간에 끊겼습니다.', retryable: true },
    ])
    expect(list.some(([e]) => e === 'delta')).toBe(true)
  })

  it('대화 형식이 틀리면 400, 없는 추천은 404, 너무 길면 413', async () => {
    const r = await card()
    const u = (content: string) => ({ role: 'user', content })
    const a = (content: string) => ({ role: 'assistant', content })
    for (const messages of [[], [a('x')], [u('x'), a('y')], [u('x'), u('y')], [u('')]]) {
      expect((await chat(r.id, { messages })).status).toBe(400)
    }
    expect((await chat('nope', { messages: [u('x')] })).status).toBe(404)
    const long = Array.from({ length: 17 }, (_, i) => (i % 2 ? a : u)('가'.repeat(4000)))
    const res = await chat(r.id, { messages: long })
    expect(res.status).toBe(413)
    expect(JSON.parse(res.text).error.code).toBe('CHAT_INPUT_TOO_LARGE')
  })

  it('--chat-off면 503 AI_UNAVAILABLE', async () => {
    await stop()
    await start({ chatOff: true })
    const r = await card()
    const res = await chat(r.id, { messages: [{ role: 'user', content: 'x' }] })
    expect(res.status).toBe(503)
    expect(JSON.parse(res.text).error).toMatchObject({
      code: 'AI_UNAVAILABLE',
      details: { reason: 'CHAT_DISABLED' },
    })
  })
})

describe('AI 기능 여부 (AI-off 계약)', () => {
  it('기본은 분석·그래프를 켠 상태이고, 로그인 없이 받는다', async () => {
    expect((await call('GET', '/capabilities', undefined, false)).data).toEqual({
      analysisEnabled: true,
      graphEnabled: true,
      discoveriesEnabled: true,
    })
  })

  it('--ai-off: 지금 BE처럼 모두 꺼지고, 저장해도 작업이 없고, 분석 요청은 503, 그래프 경로는 404', async () => {
    await stop()
    await start({ off: true })
    expect((await call('GET', '/capabilities', undefined, false)).data).toEqual({
      analysisEnabled: false,
      graphEnabled: false,
      discoveriesEnabled: false,
    })
    const n = await noteWith('**A**와 **B**')
    expect((await call('GET', `/notes/${n.id}/analysis`)).data).toEqual({ job: null })
    const r = await call('POST', `/notes/${n.id}/analysis`)
    expect(r.status).toBe(503)
    expect(r.data.error).toMatchObject({
      code: 'AI_UNAVAILABLE',
      details: { reason: 'NOT_DEPLOYED' },
    })
    expect((await call('GET', `/notes/${n.id}/graph`)).status).toBe(404)
    expect((await call('GET', '/graph')).status).toBe(404)
    expect(
      errorCode(await call('POST', '/notes/00000000-0000-4000-8000-000000000999/analysis')),
    ).toBe('NOT_FOUND')
  })
})
