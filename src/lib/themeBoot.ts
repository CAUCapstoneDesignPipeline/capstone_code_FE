/** 사용자가 고른 테마. system은 OS 설정(prefers-color-scheme)을 따른다 */
export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'

export function parsePref(stored: string | null): ThemePref {
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function resolveTheme(p: ThemePref, systemDark: boolean): Theme {
  if (p === 'system') return systemDark ? 'dark' : 'light'
  return p
}

/**
 * 첫 그림 전에 <html data-theme>을 정하는 스크립트. vite.config.ts가 index.html <head>에 넣는다 (밝은 화면 번쩍임 방지).
 * 모듈을 기다리지 않으려고 문자열로 두지만, 규칙은 위 parsePref·resolveTheme와 같아야 한다 (themeBoot.test.ts가 확인한다).
 * 이 파일은 vite.config.ts도 읽으므로 브라우저·React에 기대지 않는다.
 */
export const THEME_BOOT_SCRIPT = `try {
  var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = t
} catch (e) {}`
