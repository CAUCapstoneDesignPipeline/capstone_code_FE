// @ts-check
// 사용자가 모르는 지식 추천(v0.4.0-draft)을 흉내 낸다. 실제 BE·AI는 키워드 그래프와 LLM으로 만든다.
// 규칙: 본문에서 **굵게** 쓴 말을 키워드로 본다. 요청한 노트와 다른 노트가 같은 키워드를 쓰면,
// 그 키워드가 들어간 문장을 두 노트에서 하나씩 골라 근거 A·B로 삼는다. 외부 지식과 결론은 정해 둔 예시 문장이다.
// 같은 추천(같은 두 노트 + 같은 키워드)은 다시 분석해도 같은 id다 (BE가 지문으로 묶는 것을 흉내 낸다).
// 같은 노트를 다시 분석하면(2회차부터) 패널의 합치기(11/04 회의)를 확인할 수 있게 일부러 결과를 흔든다:
// 같은 id 카드는 결론을 조금 바꾸고, 역할이 '그대로'인 카드 하나는 빼고, 새 id 카드 3개를 더하고, 순서를 섞는다.
// 또 근거가 바뀐 카드 처리(11/04 회의)를 확인할 수 있게, 같은 id 카드에 회차마다 돌아가며 역할을 준다
// (statusRole): stale · evidence_lost · 새 revision(current) · 그대로(current).
// 이번 회차에 stale이던 카드는 다음 회차에 새 revision으로 돌아온다. evidence_lost였던 카드는 다음 회차에
// 같은 revision의 current로 오므로 FE에서는 막힌 채로 남는다. freshness·revision·outcome은 docs PR #22를 따른다.
// 외부 지식은 지금 AI가 만들지 않아 기본은 null이다 (AI #19). external 옵션을 켜면 예시 외부 지식을 준다.

import { createHash, randomUUID } from 'node:crypto'

const BOLD = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g
const SENTENCE = /[^\n.!?]+(?:[.!?]+|$)/gm
const keyOf = (/** @type {string} */ label) =>
  label.normalize('NFC').toLowerCase().replace(/\s+/g, '')

/** 한 작업이 내는 추천 수의 한도. 패널은 5장만 보이므로 넘는 경우도 만든다 (나머지는 대기) */
const MAX_RECOMMENDATIONS = 8
/** 다시 분석할 때마다 더하는 새 id 카드 수 */
const EXTRA_PER_ROUND = 3

/** 같은 id 카드의 역할 순서 (statusRole) */
const ROLES = /** @type {const} */ (['stale', 'evidence_lost', 'revised', 'current'])

/**
 * 다시 분석할 때(round > 1) 같은 id 카드 i번째의 역할. 회차마다 두 칸씩 돌아, stale이던 카드가 다음 회차에 revised가 된다.
 * @param {number} i @param {number} round
 */
export function statusRole(i, round) {
  return ROLES[(i + 2 * round) % ROLES.length]
}

/** 지문 → UUID 모양의 고정 id. 같은 지문이면 늘 같은 id다 */
function fingerprintId(/** @type {string} */ text) {
  const h = createHash('sha1').update(text).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const EXTERNAL = {
  summary: '가짜 서버의 예시 외부 지식입니다. 실제로는 AI가 인터넷에서 찾은 내용과 출처가 온다.',
  sourceUrl: 'https://www.rfc-editor.org/rfc/rfc9110',
}

/**
 * @typedef {{ id: string, title: string, body: string, version: number }} NoteLike
 * @typedef {{ noteId: string, noteTitle: string, noteVersion: number, startOffset: number, endOffset: number, quote: string }} Evidence
 */

/**
 * 노트의 키워드별 첫 문장 (원문 위치 포함). 문장 앞뒤 공백과 굵게 표시(**)는 원문 그대로 둔다.
 * @param {NoteLike} note
 * @returns {Map<string, { label: string, evidence: Evidence }>}
 */
export function keywordSentences(note) {
  /** @type {Map<string, { label: string, evidence: Evidence }>} */
  const out = new Map()
  for (const s of note.body.matchAll(SENTENCE)) {
    const raw = s[0]
    const lead = raw.length - raw.trimStart().length
    const start = /** @type {number} */ (s.index) + lead
    const end = /** @type {number} */ (s.index) + raw.trimEnd().length
    if (end <= start) continue
    const quote = note.body.slice(start, end)
    for (const m of quote.matchAll(BOLD)) {
      const key = keyOf(m[1])
      if (out.has(key)) continue
      out.set(key, {
        label: m[1],
        evidence: {
          noteId: note.id,
          noteTitle: note.title,
          noteVersion: note.version,
          startOffset: start,
          endOffset: end,
          quote,
        },
      })
    }
  }
  return out
}

/**
 * 요청한 노트(P)와 다른 노트(Q)가 같은 키워드를 쓰면 추천 하나. 다른 노트와 공유한 키워드마다 하나씩, 최대 8개.
 * round는 이 노트를 몇 번째로 분석하는지다 (1부터). 2회차부터는 위 머리말처럼 결과를 흔든다.
 * revisions는 추천 id → 마지막으로 준 revision이다 (처음은 1). 새 revision을 주면 여기에 적는다.
 * external이면 예시 외부 지식을, 아니면 null을 준다.
 * @param {NoteLike} note @param {NoteLike[]} others @param {number} [round]
 * @param {Map<string, number>} [revisions] @param {boolean} [external]
 */
export function buildRecommendations(
  note,
  others,
  round = 1,
  revisions = new Map(),
  external = false,
) {
  const mine = keywordSentences(note)
  /** @type {{ other: NoteLike, key: string, A: Evidence, B: Evidence, label: string, shared: string[] }[]} */
  const pairs = []
  for (const other of others) {
    if (other.id === note.id) continue
    const theirs = keywordSentences(other)
    const shared = [...mine.keys()].filter((k) => theirs.has(k))
    const labels = shared.map((k) => /** @type {{ label: string }} */ (mine.get(k)).label)
    for (const key of shared) {
      const m = /** @type {{ label: string, evidence: Evidence }} */ (mine.get(key))
      const t = /** @type {{ evidence: Evidence }} */ (theirs.get(key))
      pairs.push({ other, key, A: m.evidence, B: t.evidence, label: m.label, shared: labels })
    }
  }
  const again = round > 1 ? ` (${round}번째 분석)` : ''
  const card = (
    /** @type {(typeof pairs)[number]} */ p,
    /** @type {string} */ id,
    /** @type {string} */ conclusion,
    /** @type {'current' | 'stale' | 'evidence_lost'} */ freshness = 'current',
  ) => ({
    id,
    revision: revisions.get(id) ?? 1,
    freshness,
    evidenceA: p.A,
    evidenceB: p.B,
    externalKnowledge: external ? EXTERNAL : null,
    conclusion,
    relatedKeywords: p.shared,
  })
  let out = pairs.map((p, i) => {
    const id = fingerprintId(`${note.id}|${p.other.id}|${p.key}`)
    const conclusion = `'${note.title}'와 '${p.other.title}'는 '${p.label}'로 이어집니다. (가짜 서버의 예시 결론)${again}`
    if (round === 1) return card(p, id, conclusion)
    const role = statusRole(i, round)
    if (role === 'revised') {
      const revision = (revisions.get(id) ?? 1) + 1
      revisions.set(id, revision)
      return card(p, id, `${conclusion} [근거 갱신 rev ${revision}]`)
    }
    return card(p, id, conclusion, role === 'current' ? 'current' : role)
  })
  if (round > 1 && pairs.length > 0) {
    // 역할이 '그대로'(current)인 카드 하나는 이번 결과에서 빠진다 (막힌 카드·갱신 카드는 늘 보이게)
    const drop = pairs.findIndex((_, i) => statusRole(i, round) === 'current')
    if (drop >= 0) out.splice(drop, 1)
    // 새 id 카드: 같은 근거를 다른 관점으로 본 예시. 회차마다 id가 새로 생긴다
    for (let i = 0; i < EXTRA_PER_ROUND; i++) {
      const p = pairs[(round + i) % pairs.length]
      out.push(
        card(
          p,
          fingerprintId(`${note.id}|${p.other.id}|${p.key}|round${round}|${i}`),
          `'${p.label}'를 다른 관점(${round}-${i + 1})에서 보면 '${p.other.title}'의 내용이 새롭게 읽힙니다. (가짜 서버의 예시 결론)`,
        ),
      )
    }
    // BE 순서(점수 순)가 회차마다 달라진다
    const score = (/** @type {{ id: string }} */ r) => fingerprintId(`${r.id}|${round}`)
    out = out.sort((a, b) => score(a).localeCompare(score(b)))
  }
  return out.slice(0, MAX_RECOMMENDATIONS)
}

/** 최종 답. 이 답 뒤 다른 답은 409 REVIEW_CONFLICT다 (docs PR #22) */
const FINAL = new Set(['understood', 'known'])

/**
 * 추천 작업. 같은 노트에 끝나지 않은 작업이 있으면 그 작업을 돌려준다. runMs 뒤에 끝난다.
 * 끝나면 outcome으로 이유를 구분한다 (11/4 결정, BE #74): 추천 있음 RECOMMENDED · 없음 NO_RECOMMENDATIONS.
 * fail이면 AI 서버가 꺼진 것처럼 RECOMMENDATION_FAILED + 빈 배열로 끝난다 (--fail-analysis).
 * @param {{ getNote: (id: string) => NoteLike | undefined, allNotes: () => NoteLike[], now: () => string }} deps
 * @param {{ runMs?: number, fail?: boolean, external?: boolean }} [options]
 */
export function createRecommendationQueue(deps, options = {}) {
  const runMs = options.runMs ?? 1500
  /** @type {Map<string, any>} */
  const jobs = new Map()
  /** @type {Map<string, string>} 노트 → 끝나지 않은 작업 */
  const active = new Map()
  /** @type {Map<string, string | null>} 추천 id → 받은 답 (아직 없으면 null) */
  const feedback = new Map()
  /** @type {Map<string, number>} 노트 → 끝난 추천 작업 수 (다시 분석한 회차) */
  const rounds = new Map()
  /** @type {Map<string, number>} 추천 id → 마지막으로 준 revision */
  const revisions = new Map()
  /** @type {Map<string, string>} 추천 id → 마지막으로 준 freshness. current가 아니면 답에 409 */
  const freshness = new Map()

  return {
    /** @param {NoteLike} note */
    request(note) {
      const running = active.get(note.id)
      if (running) return { ...jobs.get(running) }
      const job = {
        id: randomUUID(),
        noteId: note.id,
        status: 'pending',
        outcome: null,
        recommendations: [],
        createdAt: deps.now(),
        completedAt: null,
      }
      jobs.set(job.id, job)
      active.set(note.id, job.id)
      setTimeout(() => {
        active.delete(note.id)
        const current = deps.getNote(note.id)
        const round = (rounds.get(note.id) ?? 0) + 1
        rounds.set(note.id, round)
        const recommendations =
          current && !options.fail
            ? buildRecommendations(current, deps.allNotes(), round, revisions, options.external)
            : []
        for (const r of recommendations) {
          // 같은 id로 다시 온 추천은 이미 받은 답을 지우지 않는다
          if (!feedback.has(r.id)) feedback.set(r.id, null)
          freshness.set(r.id, r.freshness)
        }
        jobs.set(job.id, {
          ...job,
          status: 'completed',
          outcome: options.fail
            ? 'RECOMMENDATION_FAILED'
            : recommendations.length > 0
              ? 'RECOMMENDED'
              : 'NO_RECOMMENDATIONS',
          recommendations,
          completedAt: deps.now(),
        })
      }, runMs).unref?.()
      return { ...job }
    },

    /**
     * 추천 카드의 답 (docs PR #22). 없는 추천이면 'missing'.
     * 마지막으로 준 freshness가 current가 아니면(stale·evidence_lost) 어떤 답이든 'stale'(409 RECOMMENDATION_STALE).
     * 같은 답 재전송·confused 뒤 최종 답은 'ok'(204). 최종 답(understood·known) 뒤 다른 답은 'conflict'(409 REVIEW_CONFLICT).
     * 그래프 반영·거절 기록은 흉내 내지 않는다.
     * @param {string} recommendationId @param {string} action
     * @returns {'ok' | 'missing' | 'stale' | 'conflict'}
     */
    feedback(recommendationId, action) {
      if (!feedback.has(recommendationId)) return 'missing'
      if ((freshness.get(recommendationId) ?? 'current') !== 'current') return 'stale'
      const before = feedback.get(recommendationId)
      if (before && FINAL.has(before) && before !== action) return 'conflict'
      feedback.set(recommendationId, action)
      return 'ok'
    },

    /** @param {string} jobId */
    get(jobId) {
      const job = jobs.get(jobId)
      return job ? { ...job } : undefined
    },
  }
}
