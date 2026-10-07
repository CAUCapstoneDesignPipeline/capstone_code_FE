import styles from './Badge.module.css'

/** Figma Badge Type=count: 주제·미분류 노트 수 */
export function CountBadge({ count }: { count: number }) {
  return <span className={styles.badge}>{count}</span>
}

/** Figma Badge 점선 테두리 (가설·개발 환경처럼 "임시"를 알리는 표시) */
export function DashedBadge({ children }: { children: string }) {
  return <span className={`${styles.badge} ${styles.dashed}`}>{children}</span>
}
