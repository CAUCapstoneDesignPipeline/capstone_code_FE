import type { ComponentPropsWithRef } from 'react'
import styles from './Button.module.css'
import { Icon, type IconName } from './Icon'

// Figma Button: primary(ink 배경), secondary(surface-muted), ghost(border-ghost), text-link(accent-link). 모두 pill.
// hover·focus·pressed는 디자인 미정이라 최소한으로만 표시한다.

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'text-link'
  size?: 'large' | 'compact'
  icon?: IconName
}

export function Button({
  variant = 'primary',
  size = 'compact',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className].filter(Boolean)
  return (
    <button type={type} className={classes.join(' ')} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

interface IconButtonProps extends ComponentPropsWithRef<'button'> {
  icon: IconName
  /** 스크린 리더와 툴팁에 쓰는 이름 */
  label: string
  selected?: boolean
}

/** Figma IconButton: 아이콘만 있는 28×28 pill. selected는 surface-selected */
export function IconButton({
  icon,
  label,
  selected,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const classes = [styles.iconButton, selected && styles.selected, className].filter(Boolean)
  return (
    <button type={type} className={classes.join(' ')} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  )
}
