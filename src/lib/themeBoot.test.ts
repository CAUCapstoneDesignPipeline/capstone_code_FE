import { describe, expect, it } from 'vitest'
import { parsePref, resolveTheme, THEME_BOOT_SCRIPT, THEME_STORAGE_KEY } from './themeBoot'

/** 첫 그림 스크립트를 가짜 브라우저에서 돌려 정한 테마를 돌려준다 */
function runBootScript(stored: string | null, systemDark: boolean) {
  const store: Record<string, string> = stored === null ? {} : { [THEME_STORAGE_KEY]: stored }
  const document = { documentElement: { dataset: {} as Record<string, string> } }
  new Function('localStorage', 'matchMedia', 'document', THEME_BOOT_SCRIPT)(
    { getItem: (k: string) => store[k] ?? null },
    () => ({ matches: systemDark }),
    document,
  )
  return document.documentElement.dataset.theme
}

describe('THEME_BOOT_SCRIPT', () => {
  it.each([null, 'light', 'dark', 'system', 'sepia'])(
    '저장값 %s: 앱 모듈과 같은 테마를 고른다',
    (stored) => {
      for (const systemDark of [false, true]) {
        expect(runBootScript(stored, systemDark)).toBe(resolveTheme(parsePref(stored), systemDark))
      }
    },
  )

  it('localStorage가 막혀도 던지지 않는다', () => {
    expect(() =>
      new Function('localStorage', 'matchMedia', 'document', THEME_BOOT_SCRIPT)(
        {
          getItem: () => {
            throw new Error('denied')
          },
        },
        () => ({ matches: false }),
        {},
      ),
    ).not.toThrow()
  })
})
