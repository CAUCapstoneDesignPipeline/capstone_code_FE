import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/** 접을 수 있는 양옆 칸: 왼쪽 사이드바, 오른쪽 추천·챗봇 패널 */
export type Side = 'sidebar' | 'panel'

const STORAGE_KEYS: Record<Side, string> = {
  sidebar: 'capstone.sidebar.collapsed',
  panel: 'capstone.panel.collapsed',
}

/** 이 브라우저에서 마지막으로 접어 두었는지. 저장소를 쓸 수 없으면(사생활 보호 창 등) 펼친다. */
function readCollapsed(side: Side): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS[side]) === 'true'
  } catch {
    return false
  }
}

/**
 * 칸 하나의 접힘 상태와 접기·펴기 버튼.
 * 누른 버튼은 사라지므로 초점을 반대쪽 버튼으로 옮기고, 상태를 브라우저에 기억한다.
 */
export function useCollapsible(side: Side) {
  const [collapsed, setCollapsedState] = useState(() => readCollapsed(side))
  const collapseRef = useRef<HTMLButtonElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)

  function setCollapsed(value: boolean) {
    flushSync(() => setCollapsedState(value))
    ;(value ? expandRef : collapseRef).current?.focus()
    try {
      localStorage.setItem(STORAGE_KEYS[side], String(value))
    } catch {
      // 저장하지 못해도 이번 화면에서는 그대로 둔다
    }
  }

  return { collapsed, setCollapsed, collapseRef, expandRef }
}
