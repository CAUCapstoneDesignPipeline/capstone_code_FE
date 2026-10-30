import type { Ref } from 'react'
import { IconButton } from '../../components/Button'
import styles from './RecommendPanel.module.css'

interface Props {
  /** 패널을 접는다 */
  onCollapse: () => void
  /** 접기 버튼. 패널을 다시 펼치면 여기로 초점을 돌려준다. */
  collapseRef?: Ref<HTMLButtonElement>
}

/** Figma W3-01 RightPanel: 3단 레이아웃의 오른쪽 칸. 추천 카드와 챗봇 대화를 이 패널 하나에 이어서 보여 준다. */
export function RecommendPanel({ onCollapse, collapseRef }: Props) {
  return (
    <aside className={styles.panel} aria-labelledby="recommend-panel-title">
      <header className={styles.header}>
        <h2 id="recommend-panel-title" className={styles.title}>
          새로운 지식 추천 &amp; 챗봇
        </h2>
        <IconButton
          ref={collapseRef}
          icon="panel-right-close"
          label="패널 접기"
          className={styles.toggle}
          onClick={onCollapse}
        />
      </header>
      {/* 추천 카드(W3-02)와 챗봇(W3-03)은 다음 단계에서 채운다 */}
      <p className={styles.hint}>
        추천 카드(A의 문장 + B의 문장 + 외부 지식 → 결론)와 챗봇 대화가 이 패널 하나에 이어서
        표시된다.
      </p>
    </aside>
  )
}
