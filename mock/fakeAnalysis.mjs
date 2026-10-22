// @ts-check
// 가짜 서버의 개념·관계 추출. 실제 AI 대신 정해진 규칙으로 같은 입력이면 같은 결과를 낸다.
// 모양은 docs/api/openapi.yaml(draft)의 NoteGraph를 따른다. 위치는 JS 문자열 인덱스(UTF-16, E1) 그대로다.
//
// 규칙
// - 개념: 본문의 **굵게** 표시한 말. 대소문자·공백만 다르면 같은 개념이고, ALIASES의 별칭은 하나로 합친다.
// - 관계: 한 문장에 개념이 둘 이상이면 앞뒤 개념을 잇는다. 유형은 문장의 표현으로 정한다 (AI concept-pipeline 6단계).
// - 근거: 관계가 나온 문장 전체.

import { randomUUID } from 'node:crypto'

/** 별칭 → 대표 이름 (시연 3번: WAL과 Write Ahead Logging은 하나의 개념) */
const ALIASES = new Map([['writeaheadlogging', 'WAL']])

/** @type {{ pattern: RegExp, code: string, label: string }[]} */
const RELATION_RULES = [
  { pattern: /의 일종/, code: 'is_a', label: '종류' },
  { pattern: /의 일부|에 포함/, code: 'part_of', label: '부분' },
  { pattern: /를 위해|을 위해|에 쓰/, code: 'used_for', label: '용도' },
  { pattern: /때문|되면|하면/, code: 'causes', label: '원인' },
  { pattern: /필요|전제/, code: 'requires', label: '전제' },
  { pattern: /처럼|와 같이|과 같이/, code: 'analogous_to', label: '유사' },
  { pattern: /와 달리|과 달리/, code: 'contrasts_with', label: '대조' },
]
const RELATED = { code: 'related', label: '관련' }

const BOLD = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g
/** 문장 끝: 마침표·물음표·느낌표 뒤 공백, 또는 줄바꿈 */
const SENTENCE = /[^\n.!?]+(?:[.!?]+|$)/gm

/** @param {string} label */
const conceptKey = (label) => label.normalize('NFC').toLowerCase().replace(/\s+/g, '')

/**
 * @typedef {{ surface: string, startOffset: number, endOffset: number }} Mention
 * @typedef {{ id: string, name: string | null }} TopicRef
 * @typedef {{ id: string, title: string, body: string, version: number, topicId: string | null }} NoteLike
 */

/** 개념·관계 id는 사용자 그래프 전체에서 하나다 (다른 노트의 같은 개념은 같은 id). */
export function createConceptRegistry() {
  /** @type {Map<string, { id: string, label: string }>} */
  const concepts = new Map()
  /** @type {Map<string, string>} */
  const ids = new Map()

  return {
    /** @param {string} surface */
    concept(surface) {
      const key = conceptKey(surface)
      const label = ALIASES.get(key) ?? surface.trim()
      const canonical = conceptKey(label)
      let c = concepts.get(canonical)
      if (!c) concepts.set(canonical, (c = { id: randomUUID(), label }))
      return c
    },
    /** 같은 key면 같은 id (다시 불러와도 관계·근거·작업 id가 그대로다) @param {string} key */
    stableId(key) {
      let id = ids.get(key)
      if (!id) ids.set(key, (id = randomUUID()))
      return id
    },
  }
}

/** @typedef {ReturnType<typeof createConceptRegistry>} ConceptRegistry */

/**
 * 노트 한 건의 개념·관계 (NoteGraph의 concepts, relations)
 * @param {ConceptRegistry} registry @param {NoteLike} note @param {{ id: string | null, name: string }} topic
 */
export function extractNoteGraph(registry, note, topic) {
  const { body } = note

  /** @type {(Mention & { concept: { id: string, label: string } })[]} */
  const mentions = []
  for (const m of body.matchAll(BOLD)) {
    const start = /** @type {number} */ (m.index) + 2
    mentions.push({
      surface: m[1],
      startOffset: start,
      endOffset: start + m[1].length,
      concept: registry.concept(m[1]),
    })
  }

  /** @type {Map<string, { id: string, label: string, mentions: Mention[] }>} */
  const concepts = new Map()
  for (const { concept, ...mention } of mentions) {
    const entry = concepts.get(concept.id) ?? { ...concept, mentions: [] }
    entry.mentions.push(mention)
    concepts.set(concept.id, entry)
  }

  /** @type {Map<string, any>} */
  const relations = new Map()
  for (const s of body.matchAll(SENTENCE)) {
    const raw = s[0]
    const lead = raw.length - raw.trimStart().length
    const start = /** @type {number} */ (s.index) + lead
    const end = /** @type {number} */ (s.index) + raw.trimEnd().length
    if (end <= start) continue
    const inside = mentions.filter((m) => m.startOffset >= start && m.endOffset <= end)
    const quote = body.slice(start, end)
    const rule = RELATION_RULES.find((r) => r.pattern.test(quote)) ?? RELATED
    for (let i = 1; i < inside.length; i++) {
      const source = inside[i - 1].concept
      const target = inside[i].concept
      if (source.id === target.id) continue
      const key = `${source.id}|${rule.code}|${target.id}`
      const relation = relations.get(key) ?? {
        id: registry.stableId(`relation|${key}`),
        source: { id: source.id, label: source.label },
        target: { id: target.id, label: target.label },
        type: { code: rule.code, label: rule.label },
        origin: 'extracted',
        status: 'active',
        asHypothesis: false,
        evidence: [],
      }
      if (!relation.evidence.some((/** @type {any} */ e) => e.startOffset === start)) {
        relation.evidence.push({
          id: registry.stableId(`evidence|${note.id}|${note.version}|${start}|${end}`),
          noteId: note.id,
          noteTitle: note.title,
          topic,
          noteVersion: note.version,
          startOffset: start,
          endOffset: end,
          quote,
          status: 'valid',
        })
      }
      relations.set(key, relation)
    }
  }

  return { concepts: [...concepts.values()], relations: [...relations.values()] }
}
