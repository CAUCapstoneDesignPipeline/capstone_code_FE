import type { ReactNode } from 'react'
import styles from './Banner.module.css'
import { Icon } from './Icon'

interface Props {
  /** alert: 충돌·삭제·실패 (ink 테두리로 강조), info: 안내 */
  kind: 'alert' | 'info'
  title: string
  description: ReactNode
  action?: ReactNode
}

/** Figma Banner: surface-card 배경, 아이콘 + 제목 + 설명 + 오른쪽 버튼. 오류색 대신 ink 테두리로 강조한다. */
export function Banner({ kind, title, description, action }: Props) {
  return (
    <div
      className={kind === 'alert' ? `${styles.banner} ${styles.alert}` : styles.banner}
      role={kind === 'alert' ? 'alert' : 'status'}
    >
      <Icon name={kind === 'alert' ? 'alert' : 'info'} className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        <p className={styles.description}>{description}</p>
      </div>
      {action}
    </div>
  )
}
