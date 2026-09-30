import { splitByQuery } from '../lib/highlight'

export function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitByQuery(text, query).map((s, i) => (s.match ? <mark key={i}>{s.text}</mark> : s.text))}
    </>
  )
}
