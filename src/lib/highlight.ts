export interface Segment {
  text: string
  match: boolean
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 검색어가 들어간 부분을 나눈다 (대소문자 무시, 여러 번 나오면 모두). 서버 검색과 같게 NFC로 맞춘다. */
export function splitByQuery(text: string, query: string): Segment[] {
  const source = text.normalize('NFC')
  const q = query.normalize('NFC').trim()
  if (!q) return [{ text: source, match: false }]

  const segments: Segment[] = []
  let last = 0
  for (const m of source.matchAll(new RegExp(escapeRegExp(q), 'giu'))) {
    if (m.index > last) segments.push({ text: source.slice(last, m.index), match: false })
    segments.push({ text: m[0], match: true })
    last = m.index + m[0].length
  }
  if (last < source.length) segments.push({ text: source.slice(last), match: false })
  return segments
}
