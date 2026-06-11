import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearSessionCookie } from '../_lib/session'

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Set-Cookie', clearSessionCookie(req))
  res.redirect(302, '/rewards')
}
