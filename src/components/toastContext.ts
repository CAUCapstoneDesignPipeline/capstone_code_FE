import { createContext, useContext } from 'react'

export type ToastKind = 'info' | 'error'

export type ShowToast = (kind: ToastKind, message: string) => void

export const ToastContext = createContext<ShowToast>(() => {})

/** 화면 아래 가운데에 잠깐 뜨는 알림 */
export function useToast(): ShowToast {
  return useContext(ToastContext)
}
