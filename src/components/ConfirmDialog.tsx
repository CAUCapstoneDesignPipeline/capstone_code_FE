import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import styles from './ConfirmDialog.module.css'

interface Props {
  title: string
  /** 설명 문장 (Figma Dialog의 두 번째 줄) */
  description: ReactNode
  /** 설명 아래 추가 내용 (예: 겹치는 제목 목록) */
  children?: ReactNode
  /** 실행 버튼 문구. 없으면 "확인" 버튼 하나만 둔다 (Type=blocked) */
  confirmLabel?: string
  cancelLabel?: string
  /** 기본 버튼 대신 넣을 실행 버튼들 (취소 버튼은 그대로 둔다). 주어지면 confirmLabel은 쓰지 않는다. */
  actions?: ReactNode
  /** 요청 중이면 버튼을 막는다 */
  pending?: boolean
  onConfirm?: () => void
  onCancel: () => void
}

/**
 * Figma Dialog. confirm: 고스트 취소 + 주요 실행. blocked: 확인 하나.
 * 그림자 없이 border-ghost 테두리, 뒤에 scrim. 렌더링되면 열리고 부모가 빼면 닫힌다. Esc는 취소.
 */
export function ConfirmDialog(props: Props) {
  const { title, description, children, confirmLabel, actions, pending, onConfirm, onCancel } =
    props
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
      <p className={styles.description}>{description}</p>
      {children}
      <div className={styles.actions}>
        {actions ? (
          <>
            <Button variant="ghost" onClick={onCancel} disabled={pending}>
              {props.cancelLabel ?? '취소'}
            </Button>
            {actions}
          </>
        ) : confirmLabel ? (
          <>
            <Button variant="ghost" onClick={onCancel} disabled={pending}>
              {props.cancelLabel ?? '취소'}
            </Button>
            <Button onClick={onConfirm} disabled={pending} autoFocus>
              {confirmLabel}
            </Button>
          </>
        ) : (
          <Button onClick={onCancel} autoFocus>
            확인
          </Button>
        )}
      </div>
    </dialog>
  )
}
