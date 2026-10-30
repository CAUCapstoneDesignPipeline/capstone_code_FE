import { IconButton } from '../../components/Button'
import { useTheme } from '../../lib/theme'

/**
 * 라이트 ↔ 다크 바로 바꾸기 (자리 임시: 사이드바 맨 아래 줄, 새 주제·새 노트 왼쪽).
 * 지금 그리는 테마의 반대로 고정한다. 시스템 설정 따르기로 되돌리는 것은 계정 메뉴에서 한다.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setPref } = useTheme()
  const dark = theme === 'dark'
  return (
    <IconButton
      icon={dark ? 'sun' : 'moon'}
      label={dark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'}
      className={className}
      onClick={() => setPref(dark ? 'light' : 'dark')}
    />
  )
}
