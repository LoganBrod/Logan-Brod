import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSession } from './_lib/session'
import { getUserStats } from './_lib/points'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = readSession(req)

  if (!session) {
    res.status(200).json({ authenticated: false })
    return
  }

  const stats = await getUserStats(session.uid)

  res.status(200).json({
    authenticated: true,
    user: { id: session.uid, username: session.username, avatar: session.avatar },
    points: stats.points,
    secondsToNextReward: stats.secondsToNextReward,
    rank: stats.rank,
  })
}
