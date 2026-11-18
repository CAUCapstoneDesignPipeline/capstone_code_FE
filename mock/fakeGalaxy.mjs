// @ts-check
// Galaxy 그래프(주제 단위 키워드 그래프, FE #44 · BE #143)의 가짜 데이터. `npm run mock -- --galaxy-demo`일 때만 쓴다.
// 응답 모양은 src/api/topicGraph.ts의 가정(계약 반영 전)을 따른다.
// 주제 계층(BE #141)은 아직 가짜 서버에도 없다. 그래서 최상위 주제와 노트만 저장소(사이드바)에 만들고,
// 하위 주제·키워드·연결은 여기 고정 데이터로만 가진다. 하위 주제의 노트는 저장소에서는 최상위 주제에 들어간다.
import { randomUUID } from 'node:crypto'

/**
 * @typedef {{ key: string, name: string, keywords: string[], children: DemoTopic[] }} DemoTopic
 * @typedef {{ label: string, concepts: number, notes: string[], origin?: 'extracted' | 'generated' }} DemoKeyword
 * @typedef {{ title: string, topic: string | null, body: string }} DemoNote
 */

/** @type {DemoTopic[]} 최상위 주제. 2단계 이상(네트워크 › 전송 계층 › 혼잡 제어), 키워드가 없는 주제(읽을거리, Linux › 커널) 포함 */
const TOPICS = [
  {
    key: 'net',
    name: '네트워크',
    keywords: ['idem', 'retry', 'timeout', 'http', 'idem-write'],
    children: [
      {
        key: 'transport',
        name: '전송 계층',
        keywords: ['tcp', 'handshake'],
        children: [
          {
            key: 'congestion',
            name: '혼잡 제어',
            keywords: ['cwnd', 'rtt', 'pacing'],
            children: [],
          },
        ],
      },
      { key: 'reliability', name: '신뢰성', keywords: ['backoff', 'ack'], children: [] },
    ],
  },
  {
    key: 'db',
    name: 'DB',
    keywords: ['index', 'tx', 'wal'],
    children: [
      { key: 'concurrency', name: '동시성', keywords: ['lock', 'isolation'], children: [] },
    ],
  },
  {
    key: 'algo',
    name: '알고리즘',
    keywords: ['bfs', 'dp', 'sort', 'heap', 'hash'],
    children: [],
  },
  {
    key: 'linux',
    name: 'Linux',
    keywords: ['proc', 'fd', 'signal'],
    children: [{ key: 'kernel', name: '커널', keywords: [], children: [] }],
  },
  { key: 'reading', name: '읽을거리', keywords: [], children: [] },
]

/** 미분류 노트(주제 없음)에서 나온 키워드. GET /graph/topics/none으로 준다 */
const UNASSIGNED_KEYWORDS = ['cache', 'ttl']

/** 미분류를 가리키는 주제 id (src/api/topicGraph.ts UNASSIGNED_TOPIC_ID) */
const UNASSIGNED_ID = 'none'

/** @type {Record<string, DemoKeyword>} */
const KEYWORDS = {
  cache: { label: '캐시', concepts: 2, notes: ['memo-cache'] },
  ttl: { label: 'TTL', concepts: 1, notes: ['memo-cache'] },
  idem: { label: '멱등성', concepts: 3, notes: ['idempotency', 'retry-policy'] },
  retry: {
    label: '재시도',
    concepts: 4,
    notes: ['retry-policy', 'timeout-setting', 'idempotency'],
  },
  timeout: { label: '타임아웃', concepts: 2, notes: ['timeout-setting'] },
  http: { label: 'HTTP 메서드', concepts: 1, notes: ['idempotency'] },
  'idem-write': {
    label: '멱등한 쓰기 설계',
    concepts: 2,
    notes: ['retry-policy'],
    origin: 'generated',
  },
  tcp: { label: 'TCP', concepts: 3, notes: ['tcp-congestion'] },
  handshake: { label: '3-way 핸드셰이크', concepts: 1, notes: ['tcp-congestion'] },
  cwnd: { label: '혼잡 윈도우', concepts: 2, notes: ['tcp-congestion'] },
  rtt: { label: 'RTT', concepts: 1, notes: ['tcp-congestion', 'timeout-setting'] },
  pacing: {
    label: '패킷 페이싱',
    concepts: 1,
    notes: ['tcp-congestion'],
    origin: 'generated',
  },
  backoff: { label: '지수 백오프', concepts: 2, notes: ['retry-policy'] },
  ack: { label: 'ACK', concepts: 1, notes: ['tcp-congestion'] },
  index: { label: '인덱스', concepts: 3, notes: ['db-index'] },
  tx: { label: '트랜잭션', concepts: 4, notes: ['db-tx'] },
  wal: { label: 'WAL', concepts: 1, notes: ['db-tx'] },
  lock: { label: '락', concepts: 2, notes: ['db-tx'] },
  isolation: { label: '격리 수준', concepts: 2, notes: ['db-tx'] },
  bfs: { label: 'BFS', concepts: 2, notes: ['algo-graph'] },
  dp: { label: '동적 계획법', concepts: 3, notes: ['algo-dp'] },
  sort: { label: '정렬', concepts: 2, notes: ['algo-dp'] },
  heap: { label: '힙', concepts: 1, notes: ['algo-graph'] },
  hash: { label: '해시', concepts: 2, notes: ['algo-dp', 'db-index'] },
  proc: { label: '프로세스', concepts: 2, notes: ['linux-proc'] },
  fd: { label: '파일 디스크립터', concepts: 1, notes: ['linux-proc'] },
  signal: { label: '시그널', concepts: 1, notes: ['linux-proc'] },
}

/** @type {Record<string, DemoNote>} 사이드바에 만들 노트. topic은 최상위 주제 key, null이면 미분류 */
const NOTES = {
  'memo-cache': {
    title: '캐시 메모',
    topic: null,
    body: '캐시는 TTL이 지나면 버린다.\n\n자주 읽는 값만 캐시에 둔다.',
  },
  'retry-policy': {
    title: '재시도 정책',
    topic: 'net',
    body: '클라이언트는 응답 시간이 초과되면 요청을 재전송한다.\n\n일시적 실패는 지수 백오프로 최대 3번 다시 보낸다.',
  },
  idempotency: {
    title: '멱등성',
    topic: 'net',
    body: '멱등한 연산은 여러 번 실행해도 한 번 실행한 것과 결과가 같다.\n\nPUT·DELETE는 멱등 메서드다.',
  },
  'timeout-setting': {
    title: '타임아웃 설정',
    topic: 'net',
    body: '타임아웃은 RTT보다 넉넉하게 잡는다.\n\n타임아웃이 난 요청은 재시도 대상으로 본다.',
  },
  'tcp-congestion': {
    title: 'TCP 혼잡 제어',
    topic: 'net',
    body: 'TCP는 3-way 핸드셰이크로 연결을 맺는다.\n\n혼잡 윈도우는 ACK를 받을 때마다 커진다.',
  },
  'db-index': {
    title: '인덱스',
    topic: 'db',
    body: 'B+트리 인덱스는 범위 검색에 강하다.\n\n해시 인덱스는 같음 비교만 빠르다.',
  },
  'db-tx': {
    title: '트랜잭션',
    topic: 'db',
    body: '트랜잭션은 WAL에 먼저 기록한다.\n\n격리 수준이 높을수록 락을 오래 잡는다.',
  },
  'algo-graph': { title: '그래프 탐색', topic: 'algo', body: 'BFS는 큐, 다익스트라는 힙을 쓴다.' },
  'algo-dp': {
    title: '동적 계획법',
    topic: 'algo',
    body: '정렬된 입력에서 부분 문제를 해시로 기억한다.',
  },
  'linux-proc': {
    title: '프로세스와 시그널',
    topic: 'linux',
    body: '프로세스는 파일 디스크립터 표를 가진다.\n\n시그널로 프로세스를 멈출 수 있다.',
  },
}

/** 연결 (key 쌍). 같은 단계에 양 끝이 있을 때만 응답에 들어간다 */
const EDGES = [
  // 최상위: 주제 사이 관련
  ['net', 'db'],
  ['net', 'algo'],
  ['net', 'linux'],
  ['db', 'algo'],
  ['algo', 'linux'],
  // 네트워크 안
  ['transport', 'reliability'],
  ['transport', 'idem'],
  ['reliability', 'timeout'],
  ['idem', 'retry'],
  ['idem', 'http'],
  ['retry', 'timeout'],
  ['retry', 'idem-write'],
  ['timeout', 'idem-write'],
  // 전송 계층 안
  ['congestion', 'tcp'],
  ['tcp', 'handshake'],
  // 혼잡 제어 안
  ['cwnd', 'rtt'],
  ['cwnd', 'pacing'],
  // 신뢰성 안
  ['backoff', 'ack'],
  // DB
  ['concurrency', 'tx'],
  ['index', 'tx'],
  ['tx', 'wal'],
  ['lock', 'isolation'],
  // 알고리즘
  ['bfs', 'heap'],
  ['dp', 'sort'],
  ['dp', 'hash'],
  // 미분류
  ['cache', 'ttl'],
  // Linux
  ['proc', 'fd'],
  ['proc', 'signal'],
  ['kernel', 'proc'],
]

/**
 * 데모 데이터를 저장소에 넣고 Galaxy 응답을 만드는 함수를 준다.
 * @param {{
 *   createTopic: (input: unknown) => { id: string },
 *   createNote: (input: unknown) => { id: string, title: string },
 * }} store
 */
export function seedGalaxyDemo(store) {
  /** @type {Map<string, string>} key → id (최상위 주제는 저장소의 주제 id) */
  const ids = new Map()
  /** @type {Map<string, { id: string, title: string }>} 노트 key → 저장소 노트 */
  const notes = new Map()

  for (const t of TOPICS) ids.set(t.key, store.createTopic({ name: t.name }).id)
  for (const [key, n] of Object.entries(NOTES)) {
    const topicId = n.topic === null ? null : ids.get(n.topic)
    const created = store.createNote({ title: n.title, topicId, body: n.body })
    notes.set(key, { id: created.id, title: created.title })
  }
  /** @param {DemoTopic} t */
  const assign = (t) => {
    if (!ids.has(t.key)) ids.set(t.key, randomUUID())
    t.children.forEach(assign)
  }
  TOPICS.forEach(assign)
  for (const key of Object.keys(KEYWORDS)) ids.set(key, randomUUID())

  /** @type {Map<string, DemoTopic>} */
  const byId = new Map()
  /** @param {DemoTopic} t */
  const index = (t) => {
    byId.set(/** @type {string} */ (ids.get(t.key)), t)
    t.children.forEach(index)
  }
  TOPICS.forEach(index)

  /** @param {DemoTopic} t @returns {string[]} 그 주제와 모든 하위 주제의 키워드 */
  const allKeywords = (t) => [...t.keywords, ...t.children.flatMap(allKeywords)]

  /** @param {DemoTopic} t */
  const topicView = (t) => {
    const keys = allKeywords(t)
    return {
      id: ids.get(t.key),
      name: t.name,
      keywordCount: keys.length,
      hasChildren: t.children.length > 0,
      childTopicCount: t.children.length,
      hasRecommended: keys.some((k) => KEYWORDS[k].origin === 'generated'),
    }
  }

  /** @param {string} key */
  const keywordView = (key, /** @type {string | null} */ topicId) => {
    const k = KEYWORDS[key]
    return {
      id: ids.get(key),
      label: k.label,
      conceptCount: k.concepts,
      origin: k.origin ?? 'extracted',
      topicId,
      documents: k.notes.map((n) => {
        const note = /** @type {{ id: string, title: string }} */ (notes.get(n))
        return { noteId: note.id, title: note.title }
      }),
    }
  }

  /** @param {string[]} keys */
  const edgesAmong = (keys) => {
    const here = new Set(keys)
    return EDGES.filter(([a, b]) => here.has(a) && here.has(b)).map(([a, b]) => ({
      sourceId: ids.get(a),
      targetId: ids.get(b),
    }))
  }

  /**
   * 한 단계의 그래프. topicId가 null이면 최상위(미분류 요약 포함), 'none'이면 미분류 노트의 키워드. 없는 주제면 null (404)
   * @param {string | null} topicId
   */
  function get(topicId) {
    if (topicId === UNASSIGNED_ID) {
      return {
        topics: [],
        // 미분류 노트의 키워드는 바로 속한 주제가 없다 (topicId null)
        keywords: UNASSIGNED_KEYWORDS.map((key) => keywordView(key, null)),
        edges: edgesAmong(UNASSIGNED_KEYWORDS),
      }
    }
    const topic = topicId === null ? null : byId.get(topicId)
    if (topicId !== null && !topic) return null
    const children = topic ? topic.children : TOPICS
    const keywordKeys = topic ? topic.keywords : []
    return {
      topics: children.map(topicView),
      keywords: keywordKeys.map((key) => keywordView(key, topicId)),
      edges: edgesAmong([...children.map((t) => t.key), ...keywordKeys]),
      // 최상위에만: 미분류 노트의 키워드 요약
      ...(topic
        ? {}
        : {
            unassigned: {
              keywordCount: UNASSIGNED_KEYWORDS.length,
              hasRecommended: UNASSIGNED_KEYWORDS.some((k) => KEYWORDS[k].origin === 'generated'),
            },
          }),
    }
  }

  return { get }
}
