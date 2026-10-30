import { Component, type ReactNode } from 'react'

interface Props {
  /** 오류가 났을 때 대신 보일 내용 */
  fallback: ReactNode
  children: ReactNode
}

/** 아래 컴포넌트가 그리다 던진 오류를 받아 fallback을 보인다. 앱 전체가 빈 화면이 되지 않게 한다. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
