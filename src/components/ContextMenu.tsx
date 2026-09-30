import { useEffect, useRef, type KeyboardEvent } from 'react'
import styles from './ContextMenu.module.css'
import { Icon, type IconName } from './Icon'

export interface MenuItem {
  label: string
  icon: IconName
  onSelect: () => void
  disabled?: boolean
  /** 이 항목 위에 구분선 (Figma MenuDivider) */
  dividerBefore?: boolean
}

interface Props {
  /** 화면 좌표. align이 right면 x가 메뉴의 오른쪽 끝 */
  x: number
  y: number
  align?: 'left' | 'right'
  items: MenuItem[]
  label: string
  onClose: () => void
}

/**
 * Figma ContextMenu: surface-card, border-ghost, 그림자 없음. 삭제 항목도 색을 바꾸지 않는다(오류색 없음).
 * 우클릭 위치나 버튼 아래에 띄운다. 바깥을 누르거나 Esc·스크롤이면 닫힌다. 위·아래 화살표로 항목을 옮겨 다닌다.
 */
export function ContextMenu({ x, y, align = 'left', items, label, onClose }: Props) {
  const ref = useRef<HTMLUListElement>(null)

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    function onEscape(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  function moveFocus(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = [
      ...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? i + 1 : i - 1
    buttons[(next + buttons.length) % buttons.length]?.focus()
  }

  return (
    <ul
      ref={ref}
      className={styles.menu}
      role="menu"
      aria-label={label}
      style={align === 'right' ? { top: y, right: window.innerWidth - x } : { top: y, left: x }}
      onKeyDown={moveFocus}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => [
        item.dividerBefore && (
          <li key={`${item.label}-divider`} role="separator" className={styles.divider} />
        ),
        <li key={item.label} role="none">
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        </li>,
      ])}
    </ul>
  )
}
