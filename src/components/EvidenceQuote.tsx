import { toExternalLink } from '../lib/externalUrl'
import styles from './EvidenceQuote.module.css'

interface Common {
  /** 근거 문장(Quote). 저장된 원문 그대로 */
  quote: string
  /** 왼쪽 20px 라벨 열 (추천 패널의 A·B·↗). 없으면 본문이 전체 폭을 쓴다 */
  label?: string
  className?: string
}

export interface NoteEvidenceProps extends Common {
  /** 사용자 노트의 원문 문장 */
  kind: 'evidence'
  noteTitle: string
  topic?: string | null
  /** 누르면 그 노트를 열고 문장을 강조한다. 없으면 누를 수 없다 */
  onOpen?: () => void
  /** 지금 열려 있는 근거 (aria-pressed) */
  selected?: boolean
}

export interface ExternalEvidenceProps extends Common {
  /** 노트 밖에서 가져온 지식 */
  kind: 'external'
  url: string
}

export interface GapEvidenceProps extends Common {
  /** 원문 근거가 없는 빈 단계 */
  kind: 'gap'
  /** "원문 근거 없음 · 사유"의 사유 */
  reason?: string
}

export type EvidenceQuoteProps = NoteEvidenceProps | ExternalEvidenceProps | GapEvidenceProps

/**
 * Figma EvidenceQuote (25:172): 상자 없이 위 구분선으로만 나누는 각주형 근거.
 * evidence는 실선, external·gap은 점선. 라벨 열 20px · 본문(문장 → 출처 줄).
 */
export function EvidenceQuote(props: EvidenceQuoteProps) {
  const { kind, quote, label, className } = props
  const rootClass = `${styles.root} ${styles[kind]} ${className ?? ''}`
  const labelEl = label ? (
    <span className={styles.label} aria-hidden>
      {label}
    </span>
  ) : null

  if (kind === 'evidence') {
    const { noteTitle, topic, onOpen, selected } = props
    const content = (
      <>
        {labelEl}
        <span className={styles.body}>
          <span className={styles.quote}>{quote}</span>
          <span className={styles.source}>
            <span className={styles.noteTitle}>{noteTitle}</span>
            {topic && <span> · {topic}</span>}
          </span>
        </span>
      </>
    )
    if (!onOpen) return <div className={rootClass}>{content}</div>
    return (
      <button
        type="button"
        className={`${rootClass} ${styles.button}`}
        aria-pressed={selected ?? undefined}
        aria-label={`${label ? `근거 ${label}, ` : ''}${noteTitle} 열고 근거 문장 보기: ${quote}`}
        onClick={onOpen}
      >
        {content}
      </button>
    )
  }

  if (kind === 'external') {
    const link = toExternalLink(props.url)
    return (
      <div className={rootClass}>
        {labelEl}
        <div className={styles.body}>
          <p className={styles.quote}>{quote}</p>
          {link ? (
            <a
              className={`${styles.source} ${styles.url}`}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              title={link.href}
              aria-label={`외부 지식 출처 ${link.label} (새 탭에서 열림)`}
            >
              {link.label}
            </a>
          ) : (
            <span className={`${styles.source} ${styles.url}`}>{props.url}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={rootClass}>
      {labelEl}
      <div className={styles.body}>
        <p className={styles.quote}>{quote}</p>
        <span className={styles.source}>
          원문 근거 없음{props.reason ? ` · ${props.reason}` : ''}
        </span>
      </div>
    </div>
  )
}
