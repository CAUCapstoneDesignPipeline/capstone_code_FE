/** 외부 지식 출처를 링크로 열 때 쓰는 주소와 화면에 보일 짧은 주소 */
export interface ExternalLink {
  href: string
  label: string
}

/**
 * AI 응답에 온 출처 URL을 링크로 바꾼다. http·https만 연다(javascript: 등은 막는다).
 * 화면에는 scheme·www.·끝 슬래시를 뗀 주소를 보인다. 링크로 열 수 없으면 null이다.
 */
export function toExternalLink(url: string): ExternalLink | null {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const host = parsed.hostname.replace(/^www\./, '')
  const rest = `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/\/$/, '')
  return { href: parsed.href, label: `${host}${rest}` }
}
