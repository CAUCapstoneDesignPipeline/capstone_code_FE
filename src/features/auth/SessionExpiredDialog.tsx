import { useState } from 'react'
import { oauthLoginUrl } from '../../api'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { withRo } from '../../lib/korean'
import styles from './Login.module.css'
import { useLoginOptions } from './useLoginOptions'

const POPUP_FEATURES = 'popup,width=480,height=640'

/**
 * Figma W1-00e 로그인 만료. 편집기 내용을 지키려고 페이지를 옮기지 않고 팝업에서 다시 로그인한다.
 * 팝업이 /auth/callback에 닿으면 이 창에 알리고, 이 창이 refresh로 새 토큰을 받으면 창이 닫힌다.
 * "나중에"는 창만 닫는다. 저장 상태는 "저장할 내용 있음"으로 남는다.
 */
export function SessionExpiredDialog({ onDismiss }: { onDismiss: () => void }) {
  const { providers, dev } = useLoginOptions()
  const [popupBlocked, setPopupBlocked] = useState(false)

  function openPopup(providerId: string) {
    const popup = window.open(oauthLoginUrl(providerId, '/'), 'capstone-login', POPUP_FEATURES)
    // 팝업이 막혔을 때의 처리는 미정 (D19). 우선 허용을 안내한다.
    setPopupBlocked(!popup)
  }

  const error = popupBlocked
    ? '팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도하세요.'
    : (dev.error?.message ?? (providers.isError ? providers.error.message : null))

  return (
    <ConfirmDialog
      title="로그인이 만료되었습니다"
      description="다시 로그인하면 이어서 저장합니다. 편집기 내용은 그대로 있습니다."
      cancelLabel="나중에"
      onCancel={onDismiss}
      pending={dev.isPending}
      actions={
        <>
          {providers.data?.providers.map((p) => (
            <Button key={p.id} icon="provider" onClick={() => openPopup(p.id)} autoFocus>
              {withRo(p.name)} 다시 로그인
            </Button>
          ))}
          {providers.data?.devTokenEnabled && (
            <Button icon="terminal" onClick={() => dev.mutate()} disabled={dev.isPending}>
              개발용 로그인
            </Button>
          )}
        </>
      }
    >
      {error && (
        <p className={styles.caption} role="alert">
          {error}
        </p>
      )}
    </ConfirmDialog>
  )
}
