// 추천 카드를 노트에 끌어다 놓을 때 본문에 넣는 내용 (Issue #43, Figma W3-22c MD/InsertedKnowledge).
// 본문은 마크다운 원문이라 인용(>) 블록으로 넣는다. 첫 줄이 라벨이면 Live Preview가 W3-22c 모양으로 그린다.
// 다른 마크다운 도구에서는 보통 인용으로 보인다.
import type { Recommendation } from '../api'

/** 블록 첫 줄의 라벨 (W3-22c "새로 이해한 지식") */
export const INSERTED_KNOWLEDGE_LABEL = '새로 이해한 지식'

/** 인용 블록의 첫 줄이 이것이면 넣은 지식 블록이다 (livePreview가 쓴다) */
export const INSERTED_KNOWLEDGE_FIRST_LINE = new RegExp(
  `^>\\s?\\*\\*${INSERTED_KNOWLEDGE_LABEL}\\*\\*\\s*$`,
)

/** 한 줄로 (인용 블록의 줄마다 `> `가 붙어야 하므로 줄바꿈을 공백으로) */
const oneLine = (text: string) => text.replace(/\s*\r?\n\s*/g, ' ').trim()

/**
 * 마크다운 특수문자를 `\`로 이스케이프한다. 결론·근거·외부 지식·노트 제목에 `**`·`_`·`[`·`$` 등이 있어도
 * 굵게(`**…**`)가 일찍 닫히거나 링크·수식·HTML로 읽히지 않게 한다. 보이는 글자는 같다 (Live Preview는 `\`를 숨긴다).
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>#~|$]/g, '\\$&')
}

/** 한 줄로 합치고 이스케이프한다 */
const plain = (text: string) => escapeMarkdown(oneLine(text))

/** http·https 주소만 넣는다 (계약: sourceUrl은 http·https) */
function httpUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * 카드 하나를 넣을 마크다운 (W3-22c 순서): 라벨 · 결론 · A · B · 외부 지식 · URL.
 * 줄 사이에 빈 인용 줄(`>`)을 두어 다른 마크다운 도구에서도 줄마다 문단으로 나뉜다 (인용 안의 이어진 줄은 한 문단으로 합쳐진다).
 * 글(결론·근거·외부 지식·노트 제목)의 마크다운 특수문자는 이스케이프한다.
 * 외부 지식이 없으면(null, 지금 AI는 항상 null) 외부 지식과 URL 줄을 뺀다. 끝에 줄바꿈은 없다.
 */
export function insertedKnowledgeMarkdown(
  r: Pick<Recommendation, 'conclusion' | 'evidenceA' | 'evidenceB' | 'externalKnowledge'>,
): string {
  const lines = [
    `**${INSERTED_KNOWLEDGE_LABEL}**`,
    `**${plain(r.conclusion)}**`,
    `A · ${plain(r.evidenceA.quote)} (${plain(r.evidenceA.noteTitle)})`,
    `B · ${plain(r.evidenceB.quote)} (${plain(r.evidenceB.noteTitle)})`,
  ]
  const external = r.externalKnowledge
  if (external) {
    lines.push(`외부 · ${plain(external.summary)}`)
    const url = httpUrl(external.sourceUrl)
    if (url) lines.push(`<${url}>`)
  }
  return lines.map((l) => `> ${l}`).join('\n>\n')
}

/**
 * pos(블록 사이 자리)에 블록 하나를 넣을 때의 바꿀 내용. 앞뒤 블록과 빈 줄 하나로 떨어지게 한다.
 * pos는 blockBoundaries가 준 자리(블록이 시작하는 줄의 처음 또는 문서 끝)다.
 */
export function insertionAt(
  doc: string,
  pos: number,
  block: string,
): { from: number; insert: string } {
  let lead = ''
  if (pos > 0) {
    if (doc[pos - 1] !== '\n') lead = '\n\n'
    else if (doc[pos - 2] !== '\n') lead = '\n'
  }
  let trail = ''
  if (pos < doc.length) trail = doc[pos] === '\n' ? '\n' : '\n\n'
  return { from: pos, insert: `${lead}${block}${trail}` }
}
