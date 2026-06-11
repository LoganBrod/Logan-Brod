import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exchangeCodeForToken, fetchCurrentUser, subscribeToChatEvents } from '../_lib/kick'
import { clearOAuthStateCookie, readOAuthStateCookie } from '../_lib/oauth-state'
import { createSessionCookie } from '../_lib/session'
import { upsertProfile } from '../_lib/points'
import { requireEnv } from '../_lib/env'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error } = req.query

  if (error) {
    res.redirect(302, `/rewards?error=${encodeURIComponent(String(error))}`)
    return
  }

  const oauth = readOAuthStateCookie(req)
  const clearCookie = clearOAuthStateCookie(req)

  if (!oauth || typeof code !== 'string' || typeof state !== 'string' || state !== oauth.state) {
    res.setHeader('Set-Cookie', clearCookie)
    res.redirect(302, '/rewards?error=invalid_state')
    return
  }

  try {
    const token = await exchangeCodeForToken({
      code,
      codeVerifier: oauth.verifier,
      clientId: requireEnv('KICK_CLIENT_ID'),
      clientSecret: requireEnv('KICK_CLIENT_SECRET'),
      redirectUri: requireEnv('KICK_REDIRECT_URI'),
    })

    const user = await fetchCurrentUser(token.access_token)

    if (oauth.purpose === 'setup') {
      await subscribeToChatEvents(token.access_token)
      res.setHeader('Set-Cookie', clearCookie)
      res.redirect(302, '/rewards?setup=success')
      return
    }

    await upsertProfile(user.user_id, user.name, user.profile_picture)

    const sessionCookie = createSessionCookie(req, {
      uid: user.user_id,
      username: user.name,
      avatar: user.profile_picture,
    })

    res.setHeader('Set-Cookie', [clearCookie, sessionCookie])
    res.redirect(302, '/rewards')
  } catch (err) {
    console.error('Kick OAuth callback failed', err)
    res.setHeader('Set-Cookie', clearCookie)
    const target = oauth.purpose === 'setup' ? '/rewards?setup=error' : '/rewards?error=login_failed'
    res.redirect(302, target)
  }
}
