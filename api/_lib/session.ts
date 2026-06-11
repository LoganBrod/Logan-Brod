import { createHmac, timingSafeEqual } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import { isLocalhost, parseCookies, serializeCookie } from './cookies'
import { requireEnv } from './env'

const SESSION_COOKIE = 'ls_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export interface SessionPayload {
  uid: number
  username: string
  avatar?: string
}

function sign(data: string): string {
  return createHmac('sha256', requireEnv('SESSION_SECRET')).update(data).digest('base64url')
}

export function createSessionCookie(req: VercelRequest, payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const value = `${data}.${sign(data)}`
  return serializeCookie(SESSION_COOKIE, value, { maxAge: SESSION_MAX_AGE, secure: !isLocalhost(req) })
}

export function clearSessionCookie(req: VercelRequest): string {
  return serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure: !isLocalhost(req) })
}

export function readSession(req: VercelRequest): SessionPayload | null {
  const cookie = parseCookies(req)[SESSION_COOKIE]
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
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload
  } catch {
    return null
  }
}
