import { useState } from 'react'
import { IconButton } from '../../components/Button'
import menuStyles from '../../components/ContextMenu.module.css'
import { Icon, type IconName } from '../../components/Icon'
import { withRo } from '../../lib/korean'
import { useAuth } from '../auth/authContext'
import { useTheme, type ThemePref } from '../../lib/theme'
import { usePopover } from '../../lib/usePopover'
import styles from './Sidebar.module.css'

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', dev: '개발용 계정' }

const THEME_OPTIONS: { value: ThemePref; label: string; icon: IconName }[] = [
  { value: 'system', label: '시스템 설정 따르기', icon: 'monitor' },
  { value: 'light', label: '라이트 모드', icon: 'sun' },
  { value: 'dark', label: '다크 모드', icon: 'moon' },
]

/**
 * Figma W1-00d 계정 메뉴: 사이드바 머리의 계정 버튼 → 이메일, 연결된 로그인 제공자, "로그아웃".
 * 그 아래에서 테마(시스템·라이트·다크)를 고른다. 고른 값은 이 브라우저에만 저장한다.
 * 로그아웃은 이 기기의 refresh 토큰만 폐기한다. 다른 기기는 로그인 상태로 남는다.
 */
export function AccountMenu() {
  const { user, logout } = useAuth()
  const { open, setOpen, rootRef, triggerRef } = usePopover<HTMLDivElement, HTMLButtonElement>()
  const [pending, setPending] = useState(false)
  const { pref, setPref } = useTheme()

  return (
    <div className={styles.account} ref={rootRef}>
      <IconButton
        ref={triggerRef}
        icon="user"
        label={`계정: ${user.displayName}`}
        selected={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <ul className={`${menuStyles.menu} ${styles.accountMenu}`} role="menu" aria-label="계정">
          <li className={styles.accountInfo} title={user.displayName}>
            <Icon name="user-outline" />
            <span className={styles.accountText}>{user.email ?? user.displayName}</span>
          </li>
          {user.providers.map((p) => (
            <li key={p} className={styles.accountInfo}>
              <Icon name="provider" />
              <span className={styles.accountText}>{withRo(PROVIDER_NAMES[p] ?? p)} 로그인됨</span>
            </li>
          ))}
          <li role="separator" className={menuStyles.divider} />
          <li role="none">
            <ul role="group" aria-label="테마" className={styles.themeGroup}>
              {THEME_OPTIONS.map((o) => (
                <li key={o.value} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={pref === o.value}
                    className={menuStyles.item}
                    onClick={() => setPref(o.value)}
                  >
                    <Icon name={o.icon} />
                    <span className={menuStyles.itemLabel}>{o.label}</span>
                    {pref === o.value && <Icon name="check" />}
                  </button>
                </li>
              ))}
            </ul>
          </li>
          <li role="separator" className={menuStyles.divider} />
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={menuStyles.item}
              disabled={pending}
              onClick={() => {
                setPending(true)
                void logout()
              }}
            >
              <Icon name="logout" />
              로그아웃
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
