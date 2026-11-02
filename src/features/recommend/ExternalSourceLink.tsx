import { toExternalLink } from '../../lib/externalUrl'
import styles from './ExternalSourceLink.module.css'

interface Props {
  /** AI 응답에 온 외부 지식 출처 URL */
  url: string
  /** 줄임표 등 놓인 자리의 글자 스타일 */
  className?: string
}

/**
 * 외부 지식 출처. 짧은 주소를 보이고 누르면 새 탭에서 연다.
 * http·https가 아니거나 URL이 아니면 열지 않고 받은 글자 그대로 보인다.
 */
export function ExternalSourceLink({ url, className }: Props) {
  const link = toExternalLink(url)
  if (!link) return <span className={className}>{url}</span>
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      title={link.href}
      aria-label={`${link.label} (새 탭에서 열림)`}
      className={`${styles.link} ${className ?? ''}`}
    >
      {link.label}
    </a>
  )
}
