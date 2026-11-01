// @ts-check
// 사용자가 모르는 지식 추천(v0.4.0-draft)을 흉내 낸다. 실제 BE·AI는 키워드 그래프와 LLM으로 만든다.
// 규칙: 본문에서 **굵게** 쓴 말을 키워드로 본다. 요청한 노트와 다른 노트가 같은 키워드를 쓰면,
// 그 키워드가 들어간 문장을 두 노트에서 하나씩 골라 근거 A·B로 삼는다. 외부 지식과 결론은 정해 둔 예시 문장이다.

import { randomUUID } from 'node:crypto'

const BOLD = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g
const SENTENCE = /[^\n.!?]+(?:[.!?]+|$)/gm
const keyOf = (/** @type {string} */ label) =>
  label.normalize('NFC').toLowerCase().replace(/\s+/g, '')

/** 한 작업이 내는 추천 수의 한도 (W3-09: 여러 개면 한 장씩 넘긴다) */
const MAX_RECOMMENDATIONS = 3

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
 * 요청한 노트(P)와 다른 노트(Q)가 같은 키워드를 쓰면 추천 하나. 다른 노트마다 하나씩, 최대 3개.
 * @param {NoteLike} note @param {NoteLike[]} others
 */
export function buildRecommendations(note, others) {
  const mine = keywordSentences(note)
  const out = []
  for (const other of others) {
    if (other.id === note.id) continue
    const theirs = keywordSentences(other)
    const shared = [...mine.keys()].filter((k) => theirs.has(k))
    if (shared.length === 0) continue
    const first = shared[0]
    out.push({
      id: randomUUID(),
      evidenceA: /** @type {{ evidence: Evidence }} */ (mine.get(first)).evidence,
      evidenceB: /** @type {{ evidence: Evidence }} */ (theirs.get(first)).evidence,
      externalKnowledge: EXTERNAL,
      conclusion: `'${note.title}'와 '${other.title}'는 '${mine.get(first)?.label}'로 이어집니다. (가짜 서버의 예시 결론)`,
      relatedKeywords: shared.map((k) => /** @type {{ label: string }} */ (mine.get(k)).label),
    })
    if (out.length >= MAX_RECOMMENDATIONS) break
  }
  return out
}

/**
 * 추천 작업. 같은 노트에 끝나지 않은 작업이 있으면 그 작업을 돌려준다. runMs 뒤에 끝난다.
 * 실패·보류·결과 없음은 모두 completed + 빈 배열이다 (10/30: 실패 비노출).
 * @param {{ getNote: (id: string) => NoteLike | undefined, allNotes: () => NoteLike[], now: () => string }} deps
 * @param {{ runMs?: number }} [options]
 */
export function createRecommendationQueue(deps, options = {}) {
  const runMs = options.runMs ?? 1500
  /** @type {Map<string, any>} */
  const jobs = new Map()
  /** @type {Map<string, string>} 노트 → 끝나지 않은 작업 */
  const active = new Map()
  /** @type {Map<string, string | null>} 추천 id → 받은 답 (아직 없으면 null) */
  const feedback = new Map()

  return {
    /** @param {NoteLike} note */
    request(note) {
      const running = active.get(note.id)
      if (running) return { ...jobs.get(running) }
      const job = {
        id: randomUUID(),
        noteId: note.id,
        status: 'pending',
        recommendations: [],
        createdAt: deps.now(),
        completedAt: null,
      }
      jobs.set(job.id, job)
      active.set(note.id, job.id)
      setTimeout(() => {
        active.delete(note.id)
        const current = deps.getNote(note.id)
        const recommendations = current ? buildRecommendations(current, deps.allNotes()) : []
        for (const r of recommendations) feedback.set(r.id, null)
        jobs.set(job.id, {
          ...job,
          status: 'completed',
          recommendations,
          completedAt: deps.now(),
        })
      }, runMs).unref?.()
      return { ...job }
    },

    /**
     * 추천 카드의 답. 없는 추천이면 false. 같은 추천에 다시 보내면 마지막 답으로 바꾼다
     * (재전송 처리는 계약에서 TBD). 그래프 반영·거절 기록은 흉내 내지 않는다.
     * @param {string} recommendationId @param {string} action
     */
    feedback(recommendationId, action) {
      if (!feedback.has(recommendationId)) return false
      feedback.set(recommendationId, action)
      return true
    },

    /** @param {string} jobId */
    get(jobId) {
      const job = jobs.get(jobId)
      return job ? { ...job } : undefined
    },
  }
}
