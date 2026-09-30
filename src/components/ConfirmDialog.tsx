import { useEffect, useRef, type ReactNode } from 'react'
import styles from './ConfirmDialog.module.css'

interface Props {
  title: string
  children: ReactNode
  confirmLabel: string
  /** 되돌릴 수 없는 동작(삭제 등)이면 빨간 버튼 */
  danger?: boolean
  /** 요청 중이면 버튼을 막는다 */
  pending?: boolean
  /** 확인 버튼을 숨긴다 (진행할 수 없음을 알리기만 할 때) */
  hideConfirm?: boolean
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/** 화면 가운데 뜨는 확인 창. 렌더링되면 열리고, 부모가 빼면 닫힌다. Esc는 취소. */
export function ConfirmDialog(props: Props) {
  const { title, children, confirmLabel, danger, pending, hideConfirm, onConfirm, onCancel } = props
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!pending) onCancel()
      }}
    >
      <h2 id="confirm-dialog-title" className={styles.title}>
        {title}
      </h2>
      <div className={styles.content}>{children}</div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel} disabled={pending}>
          {props.cancelLabel ?? '취소'}
        </button>
        {!hideConfirm && (
          <button
            type="button"
            className={`${styles.button} ${danger ? styles.danger : styles.primary}`}
            onClick={onConfirm}
            disabled={pending}
            autoFocus
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </dialog>
  )
}
