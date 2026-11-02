import { useCallback, useState } from 'react'
import { isApiError } from '../../api'
import { useFetchTitlesIn, useImportNote } from '../../data/queries'
import { numberedTitle, titleFromFileName, type PickedFile } from './markdownImport'

export type RowStatus = 'waiting' | 'importing' | 'done' | 'failed'

/** 가져오는 파일 하나 (W3-05·06 FileRow) */
export interface ImportRow {
  key: string
  fileName: string
  /** 만든 노트의 제목. 번호를 붙였으면 붙인 제목 */
  title: string
  /** 같은 제목이 있어 번호를 붙였는지 */
  renamed: boolean
  status: RowStatus
  /** 서버가 거절한 이유 (error.message 그대로) */
  error: string | null
}

export interface ImportRun {
  finished: boolean
  topicId: string | null
  topicName: string
  rows: ImportRow[]
}

/** 같은 제목을 그 사이 다른 곳에서 만들었을 때 다음 번호로 다시 시도하는 횟수 */
const TITLE_RETRIES = 3

/**
 * 노트 가져오기 실행 (W3-05: 파일을 하나씩 순서대로 POST /notes, 중간에 실패해도 나머지는 계속).
 * 대화 상자를 닫아도 계속되도록 대화 상자 바깥(사이드바)에서 쓴다. start는 끝난 결과로 끝난다.
 * 같은 주제에 같은 제목이 있으면 " (1)", " (2)"를 붙인다 (W3-06).
 */
export function useImportRunner() {
  const [run, setRun] = useState<ImportRun | null>(null)
  const importNote = useImportNote()
  const fetchTitles = useFetchTitlesIn()

  const start = useCallback(
    async (files: PickedFile[], topicId: string | null, topicName: string): Promise<ImportRun> => {
      let current: ImportRun = {
        finished: false,
        topicId,
        topicName,
        rows: files.map((f) => ({
          key: f.key,
          fileName: f.fileName,
          title: titleFromFileName(f.fileName),
          renamed: false,
          status: 'waiting',
          error: null,
        })),
      }
      const patch = (key: string, change: Partial<ImportRow>) => {
        current = {
          ...current,
          rows: current.rows.map((r) => (r.key === key ? { ...r, ...change } : r)),
        }
        setRun(current)
      }
      setRun(current)

      let taken: Set<string>
      try {
        taken = await fetchTitles(topicId)
      } catch (e) {
        const error = e instanceof Error ? e.message : '가져오지 못했습니다.'
        current = {
          ...current,
          finished: true,
          rows: current.rows.map((r) => ({ ...r, status: 'failed', error })),
        }
        setRun(current)
        return current
      }

      for (const file of files) {
        const base = titleFromFileName(file.fileName)
        patch(file.key, { status: 'importing' })
        for (let attempt = 0; ; attempt++) {
          const title = numberedTitle(base, taken)
          try {
            await importNote.mutateAsync({ title, topicId, body: file.body ?? '' })
            taken.add(title)
            patch(file.key, { status: 'done', title, renamed: title !== base })
            break
          } catch (e) {
            if (isApiError(e, 'NOTE_TITLE_TAKEN') && attempt < TITLE_RETRIES) {
              taken.add(title)
              continue
            }
            patch(file.key, {
              status: 'failed',
              error: e instanceof Error ? e.message : '가져오지 못했습니다.',
            })
            break
          }
        }
      }
      current = { ...current, finished: true }
      setRun(current)
      return current
    },
    [fetchTitles, importNote],
  )

  const clear = useCallback(() => setRun(null), [])

  return { run, start, clear }
}

/** 끝난 결과 요약 (닫은 뒤 끝났을 때 토스트) */
export function summarize(run: ImportRun): { kind: 'info' | 'error'; message: string } {
  const done = run.rows.filter((r) => r.status === 'done').length
  const failed = run.rows.filter((r) => r.status === 'failed').length
  if (failed === 0) return { kind: 'info', message: `노트 ${done}개를 가져왔습니다.` }
  if (done === 0) return { kind: 'error', message: `노트 ${failed}개를 가져오지 못했습니다.` }
  return {
    kind: 'error',
    message: `노트 ${done}개를 가져오고 ${failed}개는 가져오지 못했습니다.`,
  }
}
