// Galaxy에서 보던 단계(경로)를 사용자별로 기억한다. 노트를 열었다 그래프로 돌아오면 이어 본다.
// 모듈 변수가 아니라 쿼리 캐시에 둔다: 로그아웃하면 AuthGate가 캐시를 지워(qc.clear) 경로도 사라지고,
// 다른 사용자로 로그인하면(만료 뒤 다른 계정 포함) 키가 달라 이전 사용자의 주제 이름·경로를 보지 않는다.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { isApiError } from '../../api'
import { keys } from '../../data/queries'
import { ROOT, type GalaxyPath } from './galaxy'

/** 보던 경로. 없으면 최상위 */
export function readGalaxyPath(qc: QueryClient, userId: string): GalaxyPath {
  return qc.getQueryData<GalaxyPath>(keys.galaxyPath(userId)) ?? ROOT
}

export function writeGalaxyPath(qc: QueryClient, userId: string, path: GalaxyPath) {
  qc.setQueryData<GalaxyPath>(keys.galaxyPath(userId), path)
}

/** 이 사용자가 보던 경로와 바꾸는 함수 */
export function useGalaxyPath(userId: string): [GalaxyPath, (path: GalaxyPath) => void] {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: keys.galaxyPath(userId),
    queryFn: () => readGalaxyPath(qc, userId),
    initialData: () => readGalaxyPath(qc, userId),
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const set = useCallback((path: GalaxyPath) => writeGalaxyPath(qc, userId, path), [qc, userId])
  return [data, set]
}

/** 보던 주제가 없어졌을 때(지워짐 등) 알림 */
export const GALAXY_TOPIC_GONE_TOAST = '보던 주제를 찾을 수 없어 전체로 돌아왔습니다.'

/** 단계를 받지 못한 오류가 "그 주제가 없음"(404 NOT_FOUND)이면 최상위로 돌아간다. 그 밖의 오류면 null (다시 시도) */
export function pathAfterLevelError(error: unknown): GalaxyPath | null {
  return isApiError(error, 'NOT_FOUND') ? ROOT : null
}
