import styles from './FieldError.module.css'
import { Icon } from './Icon'

/** Figma FieldError: 오류색 없이 alert 아이콘 + 문구를 입력칸 바로 아래에 둔다 */
export function FieldError({ id, message }: { id?: string; message: string }) {
  return (
    <p id={id} className={styles.fieldError} role="alert">
      <Icon name="alert" />
      <span>{message}</span>
    </p>
  )
}
