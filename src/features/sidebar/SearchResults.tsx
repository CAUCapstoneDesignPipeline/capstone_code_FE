import { Highlight } from '../../components/Highlight'
import { useSearchNotes } from '../../data/queries'
import styles from './Sidebar.module.css'

interface Props {
  /** 입력이 멈춘 뒤의 검색어. 아직 없으면 '' */
  q: string
  topicNames: ReadonlyMap<string, string>
  selectedNoteId: string | null
  onSelectNote: (noteId: string) => void
}

export function SearchResults({ q, topicNames, selectedNoteId, onSelectNote }: Props) {
  const results = useSearchNotes(q)

  if (q === '' || results.isPending) return <p className={styles.status}>검색 중…</p>
  if (results.isError) {
    return (
      <p className={styles.error} role="alert">
        검색하지 못했습니다. {results.error.message}
      </p>
    )
  }
  if (results.data.length === 0) {
    return <p className={styles.status}>"{q}"에 맞는 노트가 없습니다.</p>
  }

  return (
    <div className={styles.results}>
      <p className={styles.resultCount} role="status">
        {results.data.length}개
      </p>
      <ul className={styles.resultList}>
        {results.data.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={styles.result}
              aria-current={n.id === selectedNoteId}
              onClick={() => onSelectNote(n.id)}
            >
              <span className={styles.resultTitle}>
                <Highlight text={n.title} query={q} />
              </span>
              <span className={styles.resultTopic}>
                {n.topicId === null ? '미분류' : (topicNames.get(n.topicId) ?? '')}
              </span>
              {n.snippet && (
                <span className={styles.resultSnippet}>
                  <Highlight text={n.snippet} query={q} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
