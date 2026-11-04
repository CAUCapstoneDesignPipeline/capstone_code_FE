import { useSyncExternalStore } from 'react'
import { parsePref, resolveTheme, THEME_STORAGE_KEY, type Theme, type ThemePref } from './themeBoot'

export type { Theme, ThemePref }

// matchMedia·localStorage가 없는 환경(테스트, 일부 웹뷰)에서도 불러올 수 있게 한다. 그때는 늘 라이트다.
const darkQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null
const listeners = new Set<() => void>()

function readPref(): ThemePref {
  try {
    return parsePref(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

let pref = readPref()
let theme = resolveTheme(pref, darkQuery?.matches ?? false)

/** <html data-theme>을 맞춘다. index.css의 다크 토큰이 이 속성을 본다 */
function apply() {
  theme = resolveTheme(pref, darkQuery?.matches ?? false)
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
  for (const l of listeners) l()
}

darkQuery?.addEventListener('change', () => {
  if (pref === 'system') apply()
})

// 다른 탭에서 바꾸면 이 탭도 따른다
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== THEME_STORAGE_KEY && e.key !== null) return
    pref = readPref()
    apply()
  })
}

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // 저장 못 해도 이번 화면에는 적용한다
  }
  apply()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** 고른 값(pref)과 실제로 그리는 테마(theme) */
export function useTheme() {
  const p = useSyncExternalStore(subscribe, () => pref)
  const t = useSyncExternalStore(subscribe, () => theme)
  return { pref: p, theme: t, setPref: setThemePref }
}

apply()
