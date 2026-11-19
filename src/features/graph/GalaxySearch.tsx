import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { isApiError, type GraphSearchResult } from '../../api'
import { Highlight } from '../../components/Highlight'
import { Icon } from '../../components/Icon'
import { keys, useGraphSearch } from '../../data/queries'
import { josaWa } from '../../lib/korean'
import { normalizeName } from '../../lib/names'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { searchKeyAction, searchResultMeta } from './galaxy'
import styles from './GraphView.module.css'

/** 입력이 멈춘 뒤 검색하기까지 (ms). 사이드바 검색과 같다 */
const GALAXY_SEARCH_DELAY_MS = 300
const SEARCH_MAX = 100

/** 검색 API가 없을 때(지금 BE, 404) 검색창의 툴팁. Figma에 없어 직접 쓴 문구 */
const GALAXY_SEARCH_UNAVAILABLE = '검색은 아직 사용할 수 없습니다.'

interface Props {
  /** 결과를 골랐다 */
  onSelect: (result: GraphSearchResult) => void
}

/**
 * Galaxy 전용 검색 (Figma W3-22g Graph/Search, 그래프 왼쪽 위). 대상은 주제와 키워드만(노트 제외, 11/19 결정).
 * 입력이 멈추면 결과 목록(이름 · 종류 · 경로). ↑↓로 고르고 Enter로 가고 Esc로 닫는다.
 * 검색 API가 없으면(404) 그래프 화면에 있는 동안 검색창을 끄고 툴팁으로 알린다.
 * 목록을 닫으면 받은 결과를 지워, 다시 열 때 새로 받는다 (목록을 보는 동안에는 다시 받지 않는다).
 */
export function GalaxySearch({ onSelect }: Props) {
  const qc = useQueryClient()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [unavailable, setUnavailable] = useState(false)
  const q = normalizeName(useDebouncedValue(query, GALAXY_SEARCH_DELAY_MS))
  const search = useGraphSearch(q, open && !unavailable)
  const results = q !== '' && search.data ? search.data.results : []
  const current = results.length > 0 ? Math.min(active, results.length - 1) : -1
  const showList = open && query.trim() !== '' && !unavailable

  // 검색 API가 없으면(지금 BE) 검색창을 끈다. 목록을 닫으며 결과(오류)를 지워도 꺼진 채로 둔다
  const notFound = isApiError(search.error, 'NOT_FOUND')
  if (notFound && !unavailable) {
    setUnavailable(true)
    setOpen(false)
  }

  function close() {
    setOpen(false)
    // 닫혀 있을 때만 지운다. 다시 열면 새로 받는다
    qc.removeQueries({ queryKey: keys.graphSearchAll })
  }

  function choose(r: GraphSearchResult) {
    close()
    onSelect(r)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const action = searchKeyAction(e.key, {
      open: showList,
      active: current,
      count: results.length,
    })
    if (!action) return
    e.preventDefault()
    if (action.kind === 'open') setOpen(true)
    else if (action.kind === 'move') setActive(action.active)
    else if (action.kind === 'choose') choose(results[action.index])
    else {
      // 문서 목록 팝업의 Esc(GalaxyView)까지 가지 않게
      e.stopPropagation()
      close()
    }
  }

  const optionId = (i: number) => `${listId}-${i}`
  const waiting = q !== normalizeName(query) || (search.isFetching && !search.data)

  return (
    <div className={styles.search} title={unavailable ? GALAXY_SEARCH_UNAVAILABLE : undefined}>
      <label className={styles.searchBox} data-disabled={unavailable}>
        <Icon name="search" className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          value={query}
          disabled={unavailable}
          placeholder="키워드·주제로 이동"
          aria-label="키워드·주제로 이동"
          maxLength={SEARCH_MAX}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && current >= 0 ? optionId(current) : undefined}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
      </label>
      {showList && (
        <div className={styles.searchResults}>
          {/* 목록을 누를 때 입력의 blur로 닫히지 않게 */}
          <ul
            id={listId}
            role="listbox"
            aria-label="검색 결과"
            className={styles.searchList}
            onMouseDown={(e) => e.preventDefault()}
          >
            {results.map((r, i) => (
              <li
                key={`${r.kind}:${r.id}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === current}
                className={styles.searchOption}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
              >
                <span className={styles.searchName}>
                  <Highlight text={r.name} query={q} />
                </span>
                <span className={styles.searchMeta}>{searchResultMeta(r)}</span>
              </li>
            ))}
          </ul>
          {results.length === 0 && (
            <p className={styles.searchStatus} role="status">
              {search.isError && !notFound
                ? '검색하지 못했습니다.'
                : waiting
                  ? '검색 중…'
                  : `'${q}'${josaWa(q)} 일치하는 주제·키워드가 없습니다.`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
