import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { KICK_AUTHORIZE_URL } from '../_lib/kick'
import { codeChallengeFromVerifier, createOAuthStateCookie, generateCodeVerifier } from '../_lib/oauth-state'
import { requireEnv } from '../_lib/env'

/**
 * One-time setup endpoint for the channel owner. Visiting this URL with the
 * correct ADMIN_SECRET starts a Kick OAuth flow that subscribes the app to
 * `chat.message.sent` webhook events for the broadcaster's channel, which
 * power the chat-presence point accrual in api/webhooks/kick.ts.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const provided = typeof req.query.secret === 'string' ? req.query.secret : ''
  const expected = requireEnv('ADMIN_SECRET')

  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  const valid = providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf)

  if (!valid) {
    res.status(403).send('Forbidden')
    return
  }

  const verifier = generateCodeVerifier()
  const challenge = codeChallengeFromVerifier(verifier)
  const state = randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnv('KICK_CLIENT_ID'),
    redirect_uri: requireEnv('KICK_REDIRECT_URI'),
    scope: 'user:read events:subscribe',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })

  res.setHeader('Set-Cookie', createOAuthStateCookie(req, { state, verifier, purpose: 'setup' }))
  res.redirect(302, `${KICK_AUTHORIZE_URL}?${params.toString()}`)
}
