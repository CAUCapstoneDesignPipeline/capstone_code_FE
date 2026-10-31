import type { KeyboardEvent } from 'react'
import type { Topic } from '../api'
import { usePopover } from '../lib/usePopover'
import menuStyles from './ContextMenu.module.css'
import { Icon } from './Icon'
import styles from './TopicSelect.module.css'

interface Props {
  /** 주제 목록. 받는 중이면 undefined (버튼을 막는다) */
  topics: Topic[] | undefined
  /** 고른 주제. null이면 미분류 */
  value: string | null
  onChange: (topicId: string | null, name: string) => void
  /** 펼친 목록 위의 제목 (예: "주제로 옮기기") */
  header: string
  /** 여는 버튼의 스크린 리더 이름. 현재 주제 이름을 받아 만든다 */
  triggerLabel: (currentName: string) => string
  disabled?: boolean
}

/**
 * Figma DropdownTrigger + Dropdown: 주제 이름과 아이콘을 누르면 주제 목록이 열린다. 맨 아래는 미분류.
 * 고르면 onChange만 부른다 (옮기기·가져오기 같은 동작은 쓰는 쪽이 정한다).
 */
export function TopicSelect({ topics, value, onChange, header, triggerLabel, disabled }: Props) {
  const { open, setOpen, rootRef, triggerRef } = usePopover<HTMLDivElement, HTMLButtonElement>()
  const currentName = value === null ? '미분류' : (topics?.find((t) => t.id === value)?.name ?? '')

  function choose(topicId: string | null, name: string) {
    setOpen(false)
    triggerRef.current?.focus()
    onChange(topicId, name)
  }

  // 대화 상자 안에서 Esc는 목록만 닫는다 (대화 상자까지 닫히지 않게).
  function onKeyDown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') e.preventDefault()
  }

  function option(topicId: string | null, name: string) {
    const selected = topicId === value
    return (
      <li key={topicId ?? 'none'} role="none">
        <button
          type="button"
          role="option"
          aria-selected={selected}
          className={styles.option}
          onClick={() => choose(topicId, name)}
        >
          <Icon name={topicId === null ? 'unassigned' : 'topic'} />
          <span className={menuStyles.itemLabel}>{name}</span>
          {selected && <Icon name="check" />}
        </button>
      </li>
    )
  }

  return (
    <div className={styles.dropdownRoot} ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.dropdownTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={triggerLabel(currentName)}
        disabled={disabled || !topics}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={value === null ? 'unassigned' : 'topic'} />
        <span>{currentName}</span>
        <Icon name="chevron-down" />
      </button>
      {open && topics && (
        <div className={styles.dropdown}>
          <p className={styles.dropdownHeader}>{header}</p>
          <ul role="listbox" aria-label={header} className={styles.optionList}>
            {topics.map((t) => option(t.id, t.name))}
            <li role="separator" className={styles.dropdownDivider} />
            {option(null, '미분류')}
          </ul>
        </div>
      )}
    </div>
  )
}
