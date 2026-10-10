import { createContext, useContext } from 'react'
import type { Me } from '../../api'

export interface AuthContextValue {
  user: Me
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/** AuthGate 안에서만 쓴다 (로그인한 뒤에만 그려지므로 user가 항상 있다) */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth는 AuthGate 안에서만 쓸 수 있습니다.')
  return value
}
