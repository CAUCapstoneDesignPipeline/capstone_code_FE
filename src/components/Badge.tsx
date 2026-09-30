import styles from './Badge.module.css'

/** Figma Badge Type=count: 주제·미분류 노트 수 */
export function CountBadge({ count }: { count: number }) {
  return <span className={styles.badge}>{count}</span>
}
