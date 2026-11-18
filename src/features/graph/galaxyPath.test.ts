import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import { keys } from '../../data/queries'
import { ROOT } from './galaxy'
import { pathAfterLevelError, readGalaxyPath, writeGalaxyPath } from './galaxyPath'

const net = { id: 'net', name: '네트워크' }

describe('보던 경로는 사용자별, 로그아웃하면 사라진다 (리뷰 2)', () => {
  it('다른 사용자는 이전 사용자의 경로를 보지 않는다', () => {
    const qc = new QueryClient()
    writeGalaxyPath(qc, 'user-a', [net])
    expect(readGalaxyPath(qc, 'user-a')).toEqual([net])
    expect(readGalaxyPath(qc, 'user-b')).toEqual(ROOT)
  })

  it('로그아웃(AuthGate의 qc.clear)하면 최상위부터 시작한다', () => {
    const qc = new QueryClient()
    writeGalaxyPath(qc, 'user-a', [net])
    qc.clear()
    expect(readGalaxyPath(qc, 'user-a')).toEqual(ROOT)
  })

  it('Galaxy를 다시 받아도(invalidate) 경로는 지워지지 않는다', async () => {
    const qc = new QueryClient()
    writeGalaxyPath(qc, 'user-a', [net])
    await qc.invalidateQueries({ queryKey: keys.galaxy })
    expect(readGalaxyPath(qc, 'user-a')).toEqual([net])
  })
})

describe('보던 주제가 없어졌을 때 (리뷰 3)', () => {
  it('404 NOT_FOUND면 최상위로, 그 밖의 오류는 그대로(다시 시도)', () => {
    expect(pathAfterLevelError(new ApiError('NOT_FOUND', '없음', 404))).toEqual(ROOT)
    expect(pathAfterLevelError(new ApiError('NETWORK_ERROR', '연결 실패', 0))).toBeNull()
  })
})
