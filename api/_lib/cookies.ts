import type { VercelRequest } from '@vercel/node'

export function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    out[key] = decodeURIComponent(value)
  }
  return out
}

interface CookieOptions {
  maxAge?: number
  secure?: boolean
}

export function serializeCookie(name: string, value: string, { maxAge, secure = true }: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (secure) parts.push('Secure')
  parts.push(`Max-Age=${maxAge ?? 0}`)
  return parts.join('; ')
}

export function isLocalhost(req: VercelRequest): boolean {
  const host = req.headers.host ?? ''
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}
