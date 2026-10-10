import { useMutation, useQuery } from '@tanstack/react-query'
import { devLogin, listAuthProviders } from '../../api'

/** 로그인 화면·로그인 만료 창 공통: GET /auth/providers 목록과 개발용 로그인 */
export function useLoginOptions() {
  const providers = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: ({ signal }) => listAuthProviders(signal),
    staleTime: Infinity,
  })
  const dev = useMutation({ mutationFn: () => devLogin() })
  return { providers, dev }
}
