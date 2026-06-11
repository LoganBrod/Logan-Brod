import { redis } from './redis'

export const SECONDS_PER_REWARD = 10 * 60 // 10 minutes of chat activity
export const POINTS_PER_REWARD = 20
export const SESSION_GAP_SECONDS = 15 * 60 // gap after which a watch session resets

const LEADERBOARD_KEY = 'leaderboard'

function userKey(userId: number | string): string {
  return `user:${userId}`
}

interface UserRecord {
  username: string
  avatar: string
  points: number
  accumulated: number
  lastSeen: number
}

async function readUser(userId: number): Promise<UserRecord | null> {
  const raw = await redis.hgetall<Record<string, unknown>>(userKey(userId))
  if (!raw || Object.keys(raw).length === 0) return null
  return {
    username: String(raw.username ?? ''),
    avatar: String(raw.avatar ?? ''),
    points: Number(raw.points ?? 0),
    accumulated: Number(raw.accumulated ?? 0),
    lastSeen: Number(raw.lastSeen ?? 0),
  }
}

/** Stores/refreshes profile info without affecting accrued points. Called on login. */
export async function upsertProfile(userId: number, username: string, avatar: string | undefined): Promise<void> {
  await redis.hset(userKey(userId), { username, avatar: avatar ?? '' })
  const existing = await readUser(userId)
  await redis.zadd(LEADERBOARD_KEY, { score: existing?.points ?? 0, member: String(userId) })
}

/**
 * Called for every chat message a viewer sends while live. Approximates watch
 * time via chat presence: continuous activity (gaps under SESSION_GAP_SECONDS)
 * accrues toward the next reward, awarding POINTS_PER_REWARD every
 * SECONDS_PER_REWARD of accumulated presence.
 */
export async function recordChatActivity(
  userId: number,
  username: string,
  avatar: string | undefined,
  nowSeconds: number,
): Promise<number> {
  const existing = await readUser(userId)

  let accumulated = existing?.accumulated ?? 0
  let points = existing?.points ?? 0
  const lastSeen = existing?.lastSeen ?? 0

  if (lastSeen === 0 || nowSeconds - lastSeen > SESSION_GAP_SECONDS) {
    accumulated = 0
  } else {
    accumulated += nowSeconds - lastSeen
  }

  let pointsEarned = 0
  while (accumulated >= SECONDS_PER_REWARD) {
    accumulated -= SECONDS_PER_REWARD
    points += POINTS_PER_REWARD
    pointsEarned += POINTS_PER_REWARD
  }

  await redis.hset(userKey(userId), {
    username,
    avatar: avatar ?? '',
    points,
    accumulated,
    lastSeen: nowSeconds,
  })
  await redis.zadd(LEADERBOARD_KEY, { score: points, member: String(userId) })

  return pointsEarned
}

export interface UserStats {
  points: number
  secondsToNextReward: number
  rank: number | null
}

export async function getUserStats(userId: number): Promise<UserStats> {
  const user = await readUser(userId)
  const rank = await redis.zrevrank(LEADERBOARD_KEY, String(userId))

  return {
    points: user?.points ?? 0,
    secondsToNextReward: SECONDS_PER_REWARD - (user?.accumulated ?? 0),
    rank: rank === null || rank === undefined ? null : rank + 1,
  }
}

export interface LeaderboardEntry {
  rank: number
  userId: number
  username: string
  avatar: string
  points: number
}

export async function getLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const raw = await redis.zrange<(string | number)[]>(LEADERBOARD_KEY, 0, limit - 1, {
    rev: true,
    withScores: true,
  })

  const entries: LeaderboardEntry[] = []
  for (let i = 0; i < raw.length; i += 2) {
    const userId = Number(raw[i])
    const points = Number(raw[i + 1])
    const user = await readUser(userId)
    entries.push({
      rank: i / 2 + 1,
      userId,
      username: user?.username || `viewer-${userId}`,
      avatar: user?.avatar ?? '',
      points,
    })
  }
  return entries
}
