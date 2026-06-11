import { useEffect, useState } from 'react'
import { fetchJSON } from '../../lib/api'

export const SECONDS_PER_REWARD = 10 * 60
export const POINTS_PER_REWARD = 20

export interface MeResponse {
  authenticated: boolean
  user?: { id: number; username: string; avatar?: string }
  points?: number
  secondsToNextReward?: number
  rank?: number | null
}

export interface LeaderboardEntry {
  rank: number
  userId: number
  username: string
  avatar: string
  points: number
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[]
}

export type RewardsStatus = 'loading' | 'ready' | 'unavailable'

export function useRewards() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [status, setStatus] = useState<RewardsStatus>('loading')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [meResult, leaderboardResult] = await Promise.all([
        fetchJSON<MeResponse>('/api/me'),
        fetchJSON<LeaderboardResponse>('/api/leaderboard'),
      ])

      if (cancelled) return

      if (!meResult.ok || !leaderboardResult.ok) {
        setStatus('unavailable')
        return
      }

      setMe(meResult.data)
      setLeaderboard(leaderboardResult.data.leaderboard)
      setStatus('ready')
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { me, leaderboard, status }
}
