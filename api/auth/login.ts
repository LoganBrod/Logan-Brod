import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'node:crypto'
import { KICK_AUTHORIZE_URL } from '../_lib/kick'
import { codeChallengeFromVerifier, createOAuthStateCookie, generateCodeVerifier } from '../_lib/oauth-state'
import { requireEnv } from '../_lib/env'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const verifier = generateCodeVerifier()
  const challenge = codeChallengeFromVerifier(verifier)
  const state = randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnv('KICK_CLIENT_ID'),
    redirect_uri: requireEnv('KICK_REDIRECT_URI'),
    scope: 'user:read',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })

  res.setHeader('Set-Cookie', createOAuthStateCookie(req, { state, verifier, purpose: 'login' }))
  res.redirect(302, `${KICK_AUTHORIZE_URL}?${params.toString()}`)
}
