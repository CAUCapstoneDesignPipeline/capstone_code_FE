// @ts-check
// 데이터를 메모리에 기억하는 가짜 서버. BE 연결 전 개발용이며 docs/api/openapi.yaml v0.1과 docs/api/rules.md를 따른다.
// 서버를 끄면 데이터는 사라진다. 계약 모양만 확인하려면 `npm run mock:prism`.
//
// 실행: npm run mock [-- --port 4010 --delay 300]
//   --delay: 모든 응답을 늦춘다 (ms). "저장 중" 상태나 요청 겹침을 볼 때 쓴다.

import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

/**
 * @typedef {{ id: string, name: string, sortOrder: number, createdAt: string }} Topic
 * @typedef {{ id: string, topicId: string | null, title: string, body: string, version: number, createdAt: string, updatedAt: string }} Note
 * @typedef {{ status: number, body?: unknown }} Reply
 */

const NAME_MAX = 50
const TITLE_MAX = 200
const BODY_MAX = 1_000_000
const Q_MAX = 100
const SNIPPET_LEN = 80

class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

/** @param {string} field @param {string} reason @param {string} message */
const invalid = (field, reason, message) =>
  new HttpError(400, 'VALIDATION_FAILED', message, { fields: [{ field, reason }] })

const notFound = () => new HttpError(404, 'NOT_FOUND', '찾을 수 없습니다.')

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

/** 서버 규칙: NFC 정규화 후 앞뒤 공백 제거 */
const normalize = (/** @type {string} */ s) => s.normalize('NFC').trim()

/**
 * 주제 이름·노트 제목 검사
 * @param {unknown} value @param {string} field @param {string} label @param {number} max
 */
function checkName(value, field, label, max) {
  if (typeof value !== 'string') throw invalid(field, 'required', `${label}이 필요합니다.`)
  const name = normalize(value)
  if (!name) throw invalid(field, 'required', `${label}을 입력하세요.`)
  if (name.includes('/'))
    throw invalid(field, 'contains_slash', `${label}에는 '/'를 쓸 수 없습니다.`)
  if ([...name].length > max)
    throw invalid(field, 'too_long', `${label}은 ${max}자까지 쓸 수 있습니다.`)
  return name
}

/** @param {unknown} value */
function checkBody(value) {
  if (typeof value !== 'string') throw invalid('body', 'required', '본문이 필요합니다.')
  if (value.length > BODY_MAX) throw invalid('body', 'too_long', '본문이 너무 깁니다.')
  return value.normalize('NFC')
}

/** @param {unknown} body */
function asObject(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'VALIDATION_FAILED', '요청 본문이 JSON 객체가 아닙니다.')
  }
  return /** @type {Record<string, unknown>} */ (body)
}

/** @param {string} text @param {string} q */
function snippet(text, q) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!q) return flat.slice(0, SNIPPET_LEN)
  const at = flat.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0) return flat.slice(0, SNIPPET_LEN)
  const start = Math.max(
    0,
    Math.min(at - Math.floor((SNIPPET_LEN - q.length) / 2), flat.length - SNIPPET_LEN),
  )
  return flat.slice(start, start + SNIPPET_LEN)
}

export function createStore() {
  /** @type {Map<string, Topic>} */
  const topics = new Map()
  /** @type {Map<string, Note>} */
  const notes = new Map()

  /** @param {string} id */
  const topicOr404 = (id) => {
    const t = topics.get(id)
    if (!t) throw notFound()
    return t
  }
  /** @param {string} id */
  const noteOr404 = (id) => {
    const n = notes.get(id)
    if (!n) throw notFound()
    return n
  }
  /** @param {string | null} topicId */
  const notesIn = (topicId) => [...notes.values()].filter((n) => n.topicId === topicId)

  /** 같은 주제(또는 미분류)에 같은 제목이 있으면 409 @param {string | null} topicId @param {string} title @param {string} [exceptId] */
  function assertTitleFree(topicId, title, exceptId) {
    if (notesIn(topicId).some((n) => n.title === title && n.id !== exceptId)) {
      const where = topicId === null ? '미분류' : '같은 주제'
      throw new HttpError(409, 'NOTE_TITLE_TAKEN', `${where}에 같은 제목의 노트가 있습니다.`, {
        titles: [title],
      })
    }
  }

  /** @param {string} name @param {string} [exceptId] */
  function assertTopicNameFree(name, exceptId) {
    if ([...topics.values()].some((t) => t.name === name && t.id !== exceptId)) {
      throw new HttpError(409, 'TOPIC_NAME_TAKEN', '같은 이름의 주제가 있습니다.')
    }
  }

  /** @param {unknown} value */
  function checkTopicId(value) {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string')
      throw invalid('topicId', 'invalid_type', 'topicId가 올바르지 않습니다.')
    topicOr404(value)
    return value
  }

  /** @param {Topic} t */
  const topicView = (t) => ({ ...t, noteCount: notesIn(t.id).length })

  return {
    listTopics() {
      const list = [...topics.values()].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'),
      )
      return { topics: list.map(topicView), unassignedNoteCount: notesIn(null).length }
    },

    /** @param {unknown} input */
    createTopic(input) {
      const name = checkName(asObject(input).name, 'name', '주제 이름', NAME_MAX)
      assertTopicNameFree(name)
      const orders = [...topics.values()].map((t) => t.sortOrder)
      /** @type {Topic} */
      const topic = {
        id: randomUUID(),
        name,
        sortOrder: orders.length ? Math.max(...orders) + 1 : 0,
        createdAt: now(),
      }
      topics.set(topic.id, topic)
      return topicView(topic)
    },

    /** @param {string} id @param {unknown} input */
    updateTopic(id, input) {
      const body = asObject(input)
      const topic = topicOr404(id)
      if (body.name === undefined && body.sortOrder === undefined) {
        throw invalid('name', 'required', '바꿀 값이 없습니다.')
      }
      const name =
        body.name === undefined ? topic.name : checkName(body.name, 'name', '주제 이름', NAME_MAX)
      if (body.sortOrder !== undefined && !Number.isInteger(body.sortOrder)) {
        throw invalid('sortOrder', 'invalid_type', 'sortOrder는 정수여야 합니다.')
      }
      assertTopicNameFree(name, id)
      topic.name = name
      if (body.sortOrder !== undefined) topic.sortOrder = /** @type {number} */ (body.sortOrder)
      return topicView(topic)
    },

    /** @param {string} id */
    deleteTopic(id) {
      topicOr404(id)
      const unassigned = new Set(notesIn(null).map((n) => n.title))
      const clashes = notesIn(id)
        .map((n) => n.title)
        .filter((title) => unassigned.has(title))
      if (clashes.length) {
        throw new HttpError(
          409,
          'NOTE_TITLE_TAKEN',
          '미분류에 같은 제목의 노트가 있어 주제를 삭제할 수 없습니다.',
          { titles: clashes },
        )
      }
      for (const n of notesIn(id)) n.topicId = null
      topics.delete(id)
    },

    /** @param {URLSearchParams} params */
    listNotes(params) {
      const topicId = params.get('topicId')
      const q = params.get('q') ?? ''
      const sort = params.get('sort') ?? 'title'
      if ([...q].length > Q_MAX)
        throw invalid('q', 'too_long', `검색어는 ${Q_MAX}자까지 쓸 수 있습니다.`)
      if (sort !== 'title' && sort !== 'updated')
        throw invalid('sort', 'invalid_value', 'sort가 올바르지 않습니다.')

      let list = [...notes.values()]
      if (topicId === 'none') list = list.filter((n) => n.topicId === null)
      else if (topicId) list = list.filter((n) => n.topicId === topicId)
      const needle = q.normalize('NFC').toLowerCase()
      if (needle) {
        list = list.filter(
          (n) => n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle),
        )
      }
      list.sort((a, b) =>
        sort === 'updated'
          ? b.updatedAt.localeCompare(a.updatedAt)
          : a.title.localeCompare(b.title, 'ko'),
      )
      return {
        notes: list.map((n) => ({
          id: n.id,
          topicId: n.topicId,
          title: n.title,
          snippet: snippet(n.body, needle),
          updatedAt: n.updatedAt,
        })),
      }
    },

    /** @param {unknown} input */
    createNote(input) {
      const body = asObject(input)
      const title = checkName(body.title, 'title', '제목', TITLE_MAX)
      const text = body.body === undefined ? '' : checkBody(body.body)
      const topicId = checkTopicId(body.topicId)
      assertTitleFree(topicId, title)
      const at = now()
      /** @type {Note} */
      const note = {
        id: randomUUID(),
        topicId,
        title,
        body: text,
        version: 0,
        createdAt: at,
        updatedAt: at,
      }
      notes.set(note.id, note)
      return { ...note }
    },

    /** @param {string} id */
    getNote(id) {
      return { ...noteOr404(id) }
    },

    /** @param {string} id @param {unknown} input */
    updateNote(id, input) {
      const body = asObject(input)
      const title = checkName(body.title, 'title', '제목', TITLE_MAX)
      const text = checkBody(body.body)
      if (!Number.isInteger(body.version) || /** @type {number} */ (body.version) < 0) {
        throw invalid('version', 'required', 'version이 필요합니다.')
      }
      const note = noteOr404(id)
      if (body.version !== note.version) {
        throw new HttpError(409, 'NOTE_CONFLICT', '다른 곳에서 이 노트가 먼저 수정되었습니다.', {
          current: { ...note },
        })
      }
      assertTitleFree(note.topicId, title, id)
      Object.assign(note, { title, body: text, version: note.version + 1, updatedAt: now() })
      return { ...note }
    },

    /** @param {string} id */
    deleteNote(id) {
      noteOr404(id)
      notes.delete(id)
    },

    /** @param {string} id @param {unknown} input */
    moveNote(id, input) {
      const body = asObject(input)
      if (!('topicId' in body)) throw invalid('topicId', 'required', 'topicId가 필요합니다.')
      const note = noteOr404(id)
      const topicId = checkTopicId(body.topicId)
      assertTitleFree(topicId, note.title, id)
      note.topicId = topicId
      return { ...note }
    },
  }
}

/** @typedef {ReturnType<typeof createStore>} Store */

/**
 * @param {Store} store @param {string} method @param {string[]} parts @param {URLSearchParams} params @param {unknown} body
 * @returns {Reply}
 */
function route(store, method, parts, params, body) {
  const [resource, id, sub, ...rest] = parts
  if (rest.length) throw notFound()

  if (resource === 'topics' && !sub) {
    if (!id && method === 'GET') return { status: 200, body: store.listTopics() }
    if (!id && method === 'POST') return { status: 201, body: store.createTopic(body) }
    if (id && method === 'PATCH') return { status: 200, body: store.updateTopic(id, body) }
    if (id && method === 'DELETE') return (store.deleteTopic(id), { status: 204 })
  }
  if (resource === 'notes') {
    if (!id && method === 'GET') return { status: 200, body: store.listNotes(params) }
    if (!id && method === 'POST') return { status: 201, body: store.createNote(body) }
    if (id && !sub && method === 'GET') return { status: 200, body: store.getNote(id) }
    if (id && !sub && method === 'PUT') return { status: 200, body: store.updateNote(id, body) }
    if (id && !sub && method === 'DELETE') return (store.deleteNote(id), { status: 204 })
    if (id && sub === 'topic' && method === 'PUT')
      return { status: 200, body: store.moveNote(id, body) }
  }
  throw new HttpError(404, 'NOT_FOUND', `없는 경로입니다: ${method} /${parts.join('/')}`)
}

/** @param {import('node:http').IncomingMessage} req */
async function readBody(req) {
  let text = ''
  for await (const chunk of req) text += chunk
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'VALIDATION_FAILED', '요청 본문이 올바른 JSON이 아닙니다.')
  }
}

/** @param {{ delayMs?: number, log?: boolean }} [options] */
export function createMockServer({ delayMs = 0, log = false } = {}) {
  const store = createStore()

  return createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
    res.setHeader('Vary', 'Origin')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    const url = new URL(req.url ?? '/', 'http://localhost')
    // 실제 BE 주소(/api)와 Prism 주소(/) 모두 받는다.
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts[0] === 'api') parts.shift()

    /** @type {Reply} */
    let reply
    try {
      const body = await readBody(req)
      reply = route(store, req.method ?? 'GET', parts, url.searchParams, body)
    } catch (e) {
      if (e instanceof HttpError) {
        reply = {
          status: e.status,
          body: {
            error: { code: e.code, message: e.message, ...(e.details && { details: e.details }) },
          },
        }
      } else {
        console.error(e)
        reply = { status: 500, body: { error: { code: 'INTERNAL', message: '가짜 서버 오류' } } }
      }
    }

    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    if (log) console.log(`${req.method} ${url.pathname}${url.search} → ${reply.status}`)
    if (reply.body === undefined) {
      res.writeHead(reply.status).end()
    } else {
      res.writeHead(reply.status, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(reply.body))
    }
  })
}

/** @param {string[]} argv @param {string} name @param {number} fallback */
function numberArg(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? Number(argv[i + 1]) : fallback
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2)
  const port = numberArg(argv, 'port', 4010)
  const delayMs = numberArg(argv, 'delay', 0)
  createMockServer({ delayMs, log: true }).listen(port, '127.0.0.1', () => {
    console.log(`가짜 서버: http://localhost:${port}${delayMs ? ` (응답 지연 ${delayMs}ms)` : ''}`)
    console.log('데이터는 메모리에만 있다. 끄면 사라진다.')
  })
}
