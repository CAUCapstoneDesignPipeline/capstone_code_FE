import { useEffect, useRef, useState } from 'react'

/** 메뉴·선택 상자 공통: 열고 닫기, 바깥을 누르거나 Esc를 누르면 닫고 여는 버튼으로 포커스를 돌린다. */
export function usePopover<R extends HTMLElement, T extends HTMLElement>() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<R>(null)
  const triggerRef = useRef<T>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return { open, setOpen, rootRef, triggerRef }
}
