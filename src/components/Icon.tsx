import type { CSSProperties } from 'react'
import alert from '../assets/icons/alert.svg'
import arrowDown from '../assets/icons/arrow-down.svg'
import arrowUp from '../assets/icons/arrow-up.svg'
import check from '../assets/icons/check.svg'
import chevronDown from '../assets/icons/chevron-down.svg'
import chevronRight from '../assets/icons/chevron-right.svg'
import close from '../assets/icons/close.svg'
import dot from '../assets/icons/dot.svg'
import info from '../assets/icons/info.svg'
import loader from '../assets/icons/loader.svg'
import logout from '../assets/icons/logout.svg'
import more from '../assets/icons/more.svg'
import note from '../assets/icons/note.svg'
import pencil from '../assets/icons/pencil.svg'
import plus from '../assets/icons/plus.svg'
import provider from '../assets/icons/provider.svg'
import search from '../assets/icons/search.svg'
import terminal from '../assets/icons/terminal.svg'
import topic from '../assets/icons/topic.svg'
import trash from '../assets/icons/trash.svg'
import unassigned from '../assets/icons/unassigned.svg'
import user from '../assets/icons/user.svg'
import userOutline from '../assets/icons/user-outline.svg'
import styles from './Icon.module.css'

// Figma CAPSTONE "02 Components"의 Icon/* (16px 선 아이콘). SVG는 받은 그대로 두고 mask로 입혀 글자색(currentColor)을 따른다.
const ICONS = {
  alert,
  'arrow-down': arrowDown,
  'arrow-up': arrowUp,
  check,
  'chevron-down': chevronDown,
  'chevron-right': chevronRight,
  close,
  dot,
  info,
  loader,
  logout,
  more,
  note,
  pencil,
  plus,
  provider,
  search,
  terminal,
  topic,
  trash,
  unassigned,
  user,
  'user-outline': userOutline,
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <span
      aria-hidden
      className={className ? `${styles.icon} ${className}` : styles.icon}
      style={{ '--icon': `url("${ICONS[name]}")` } as CSSProperties}
    />
  )
}
