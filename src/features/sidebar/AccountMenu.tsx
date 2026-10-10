import { useState } from 'react'
import { IconButton } from '../../components/Button'
import menuStyles from '../../components/ContextMenu.module.css'
import { Icon } from '../../components/Icon'
import { withRo } from '../../lib/korean'
import { useAuth } from '../auth/authContext'
import { usePopover } from '../../lib/usePopover'
import styles from './Sidebar.module.css'

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', dev: '개발용 계정' }

/**
 * Figma W1-00d 계정 메뉴: 사이드바 머리의 계정 버튼 → 이메일, 연결된 로그인 제공자, "로그아웃".
 * 로그아웃은 이 기기의 refresh 토큰만 폐기한다. 다른 기기는 로그인 상태로 남는다.
 */
export function AccountMenu() {
  const { user, logout } = useAuth()
  const { open, setOpen, rootRef, triggerRef } = usePopover<HTMLDivElement, HTMLButtonElement>()
  const [pending, setPending] = useState(false)

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
