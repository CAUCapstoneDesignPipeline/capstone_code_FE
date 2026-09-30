import { Highlight } from '../../components/Highlight'
import { Icon } from '../../components/Icon'
import { useSearchNotes } from '../../data/queries'
import { josaWa } from '../../lib/korean'
import styles from './Sidebar.module.css'

interface Props {
  /** 입력이 멈춘 뒤의 검색어. 아직 없으면 '' */
  q: string
  topicNames: ReadonlyMap<string, string>
  selectedNoteId: string | null
  onSelectNote: (noteId: string) => void
}

/** 검색 중에는 주제 트리 대신 결과 목록 (W1-14, W1-15). 항목은 Figma SearchResultItem */
export function SearchResults({ q, topicNames, selectedNoteId, onSelectNote }: Props) {
  const results = useSearchNotes(q)
  const done = q !== '' && results.isSuccess

  return (
    <>
      <h2 className={styles.sectionLabel} role="status">
        {done ? `검색 결과 ${results.data.length}` : '검색 중…'}
      </h2>
      {results.isError && (
        <div className={styles.searchEmpty} role="alert">
          <p className={styles.searchEmptyTitle}>검색하지 못했습니다.</p>
          <p className={styles.searchEmptyHint}>{results.error.message}</p>
        </div>
      )}
      {done && results.data.length === 0 && (
        <div className={styles.searchEmpty}>
          <p className={styles.searchEmptyTitle}>
            '{q}'{josaWa(q)} 일치하는 노트가 없습니다.
          </p>
          <p className={styles.searchEmptyHint}>
            제목과 본문에서 찾습니다. 검색어를 지우면 주제 트리로 돌아갑니다.
          </p>
        </div>
      )}
      {done && results.data.length > 0 && (
        <ul className={styles.list}>
          {results.data.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={styles.result}
                aria-current={n.id === selectedNoteId}
                onClick={() => onSelectNote(n.id)}
              >
                <span className={styles.resultTitleRow}>
                  <Icon name="note" />
                  <span className={styles.resultTitle}>
                    <Highlight text={n.title} query={q} />
                  </span>
                </span>
                {n.snippet && (
                  <span className={styles.resultSnippet}>
                    <Highlight text={n.snippet} query={q} />
                  </span>
                )}
                <span className={styles.resultTopic}>
                  {n.topicId === null ? '미분류' : (topicNames.get(n.topicId) ?? '')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
