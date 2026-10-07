import { DashedBadge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { oauthLoginUrl } from '../../api'
import { withRo } from '../../lib/korean'
import styles from './Login.module.css'
import { useLoginOptions } from './useLoginOptions'

interface Props {
  /** 카드 위쪽에 보일 실패 이유 (W1-00b) */
  error?: string | null
  /** 로그인 뒤 돌아갈 앱 안의 경로 */
  returnTo?: string
}

/**
 * Figma W1-00a 로그인 · W1-00b 로그인 실패 · W1-00c 개발 환경.
 * 제공자 버튼은 GET /auth/providers 목록으로 그리고, 누르면 페이지를 /auth/oauth2/{provider}로 옮긴다.
 * devTokenEnabled일 때만 아래에 개발용 로그인을 보인다.
 */
export function LoginScreen({ error, returnTo = '/' }: Props) {
  const { providers, dev } = useLoginOptions()
  const message = (dev.error?.message ?? error) || null

  return (
    <main className={styles.screen}>
      <section className={styles.card} aria-labelledby="login-title">
        <header className={styles.header}>
          <p className={styles.eyebrow}>CAPSTONE</p>
          <h1 id="login-title" className={styles.title}>
            로그인
          </h1>
          <p className={styles.description}>노트 사이의 숨은 연결을 근거와 함께 찾아 줍니다.</p>
        </header>

        {message && (
          <div className={styles.error} role="alert">
            <Icon name="alert" className={styles.errorIcon} />
            <p className={styles.errorText}>{message}</p>
          </div>
        )}

        {providers.isPending && <p className={styles.caption}>불러오는 중…</p>}
        {providers.isError && (
          <div className={styles.group}>
            <p className={styles.caption} role="alert">
              로그인 방법을 불러오지 못했습니다. {providers.error.message}
            </p>
            <Button variant="ghost" size="large" onClick={() => providers.refetch()}>
              다시 시도
            </Button>
          </div>
        )}
        {providers.isSuccess && providers.data.providers.length > 0 && (
          <div className={styles.group}>
            {providers.data.providers.map((p) => (
              <Button
                key={p.id}
                variant="secondary"
                size="large"
                icon="provider"
                className={styles.wide}
                onClick={() => window.location.assign(oauthLoginUrl(p.id, returnTo))}
              >
                {withRo(p.name)} 계속하기
              </Button>
            ))}
          </div>
        )}
        {providers.isSuccess && providers.data.devTokenEnabled && (
          <div className={styles.group}>
            <hr className={styles.divider} />
            <DashedBadge>개발 환경 · local 프로필</DashedBadge>
            <Button
              variant="ghost"
              size="large"
              icon="terminal"
              className={styles.wide}
              disabled={dev.isPending}
              onClick={() => dev.mutate()}
            >
              개발용 로그인
            </Button>
            <p className={styles.caption}>
              구글 로그인 없이 dev@capstone.local 계정으로 들어갑니다.
            </p>
          </div>
        )}
        {providers.isSuccess &&
          providers.data.providers.length === 0 &&
          !providers.data.devTokenEnabled && (
            <p className={styles.caption}>
              사용할 수 있는 로그인 방법이 없습니다. 서버 설정을 확인하세요.
            </p>
          )}

        <p className={styles.caption}>허용된 계정만 사용할 수 있습니다.</p>
      </section>
    </main>
  )
}
