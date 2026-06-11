import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getLeaderboard } from './_lib/points'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const leaderboard = await getLeaderboard(10)
  res.status(200).json({ leaderboard })
}
