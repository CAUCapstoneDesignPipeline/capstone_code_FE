import { Icon, type IconName } from '../../components/Icon'
import styles from './NoteEditor.module.css'
import type { SaveStatus } from './noteSaver'

const VIEW: Record<SaveStatus, { label: string; icon: IconName; stuck: boolean }> = {
  saved: { label: '저장됨', icon: 'check', stuck: false },
  saving: { label: '저장 중', icon: 'loader', stuck: false },
  pending: { label: '저장할 내용 있음', icon: 'dot', stuck: false },
  // W1-09: 계약에 해당 상태가 없어 Figma가 임시로 쓴 문구
  invalid: { label: '저장 안 됨 · 제목 오류', icon: 'alert', stuck: true },
  error: { label: '저장 안 됨', icon: 'alert', stuck: true },
  conflict: { label: '저장 안 됨 · 충돌', icon: 'alert', stuck: true },
  deleted: { label: '저장 안 됨 · 삭제됨', icon: 'alert', stuck: true },
}

/**
 * Figma SaveStatus: 저장됨·저장 중·저장할 내용 있음은 ink-muted,
 * 저장 안 됨은 ink 글자 + ink 테두리 + alert 아이콘으로 구분한다(오류색 없음).
 */
export function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  const view = VIEW[status]
  return (
    <span
      className={view.stuck ? `${styles.saveStatus} ${styles.saveStatusStuck}` : styles.saveStatus}
      data-status={status}
      role="status"
    >
      <Icon name={view.icon} className={status === 'saving' ? styles.spin : undefined} />
      {view.label}
    </span>
  )
}
