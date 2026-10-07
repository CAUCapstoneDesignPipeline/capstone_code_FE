import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import styles from './Toast.module.css'
import { ToastContext, type ToastKind } from './toastContext'

const VISIBLE_MS = 4000

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

/** Figma Toast: ink 배경 + canvas 글자. error는 alert 아이콘으로만 구분한다. 한 번에 하나만 보여준다. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null)
  const nextId = useRef(0)

  const show = useCallback((kind: ToastKind, message: string) => {
    setToast({ id: nextId.current++, kind, message })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={styles.toast}>
            <Icon name={toast.kind === 'error' ? 'alert' : 'info'} />
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
