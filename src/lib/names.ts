// 주제 이름·노트 제목 규칙 (openapi.yaml 공통 규칙). 서버도 같은 검사를 하지만, 요청 전에 이유를 바로 보여주려고 앱에서도 검사한다.

export const TOPIC_NAME_MAX = 50
export const NOTE_TITLE_MAX = 200
export const UNTITLED = '제목 없음'

/** 서버와 같은 방식으로 정리한다: NFC 정규화 후 앞뒤 공백 제거 */
export function normalizeName(value: string): string {
  return value.normalize('NFC').trim()
}

/** 규칙에 맞으면 null, 아니면 화면에 보여줄 이유 */
export function checkName(value: string, label: string, max: number): string | null {
  const name = normalizeName(value)
  if (!name) return `${label}을 입력하세요.`
  if (name.includes('/')) return `${label}에는 '/'를 쓸 수 없습니다.`
  if ([...name].length > max) return `${label}은 ${max}자까지 쓸 수 있습니다.`
  return null
}

/** 새 노트의 기본 제목. 같은 주제의 제목과 겹치지 않게 "제목 없음", "제목 없음 1", "제목 없음 2", … 순서로 고른다 (Figma W1-08). */
export function nextUntitledTitle(existing: Iterable<string>): string {
  const taken = new Set([...existing].map(normalizeName))
  if (!taken.has(UNTITLED)) return UNTITLED
  for (let n = 1; ; n++) {
    const title = `${UNTITLED} ${n}`
    if (!taken.has(title)) return title
  }
}
