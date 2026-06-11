import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import { isLocalhost, parseCookies, serializeCookie } from './cookies'
import { requireEnv } from './env'

const OAUTH_COOKIE = 'ls_oauth'
const OAUTH_MAX_AGE = 60 * 10 // 10 minutes

export type OAuthPurpose = 'login' | 'setup'

export interface OAuthState {
  state: string
  verifier: string
  purpose: OAuthPurpose
}

function sign(data: string): string {
  return createHmac('sha256', requireEnv('SESSION_SECRET')).update(data).digest('base64url')
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

export function codeChallengeFromVerifier(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function createOAuthStateCookie(req: VercelRequest, oauth: OAuthState): string {
  const data = Buffer.from(JSON.stringify(oauth)).toString('base64url')
  const value = `${data}.${sign(data)}`
  return serializeCookie(OAUTH_COOKIE, value, { maxAge: OAUTH_MAX_AGE, secure: !isLocalhost(req) })
}

export function clearOAuthStateCookie(req: VercelRequest): string {
  return serializeCookie(OAUTH_COOKIE, '', { maxAge: 0, secure: !isLocalhost(req) })
}

export function readOAuthStateCookie(req: VercelRequest): OAuthState | null {
  const cookie = parseCookies(req)[OAUTH_COOKIE]
  if (!cookie) return null

  const dotIndex = cookie.lastIndexOf('.')
  if (dotIndex === -1) return null
  const data = cookie.slice(0, dotIndex)
  const sig = cookie.slice(dotIndex + 1)

  const expected = sign(data)
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null

  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as OAuthState
  } catch {
    return null
  }
}
