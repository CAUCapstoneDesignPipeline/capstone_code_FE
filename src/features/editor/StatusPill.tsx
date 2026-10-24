import { Icon, type IconName } from '../../components/Icon'
import styles from './NoteEditor.module.css'

interface Props {
  label: string
  icon: IconName
  /** 멈춘 상태(저장 안 됨, 분석 실패): ink 글자 + ink 테두리 */
  stuck: boolean
  /** 진행 중이면 아이콘을 돌린다 */
  spinning: boolean
  /** data-status (테스트·스타일 훅) */
  status: string
  title?: string
}

/** Figma SaveStatus·AnalysisStatus 공통 모양. 진행·완료는 ink-muted, 멈춘 상태는 테두리로 구분한다(오류색 없음). */
export function StatusPill({ label, icon, stuck, spinning, status, title }: Props) {
  return (
    <span
      className={stuck ? `${styles.saveStatus} ${styles.saveStatusStuck}` : styles.saveStatus}
      data-status={status}
      role="status"
      title={title}
    >
      <Icon name={icon} className={spinning ? styles.spin : undefined} />
      {label}
    </span>
  )
}
