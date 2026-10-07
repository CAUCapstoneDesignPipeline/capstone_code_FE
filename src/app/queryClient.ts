import { QueryClient } from '@tanstack/react-query'
import { isApiError } from '../api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 서버가 답한 오류(404 등)는 다시 물어도 같다. 연결 실패만 한 번 더 시도한다.
      retry: (failureCount, error) => isApiError(error, 'NETWORK_ERROR') && failureCount < 1,
    },
  },
})
