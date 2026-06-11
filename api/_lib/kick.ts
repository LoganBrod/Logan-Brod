import { createVerify } from 'node:crypto'

export const KICK_AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize'
export const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token'
export const KICK_API_BASE = 'https://api.kick.com/public/v1'

export interface KickTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope?: string
}

export interface KickUser {
  user_id: number
  name: string
  email?: string
  profile_picture?: string
}

export async function exchangeCodeForToken(params: {
  code: string
  codeVerifier: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<KickTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  })

  const res = await fetch(KICK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw new Error(`Kick token exchange failed: ${res.status} ${await res.text()}`)
  }

  return (await res.json()) as KickTokenResponse
}

export async function fetchCurrentUser(accessToken: string): Promise<KickUser> {
  const res = await fetch(`${KICK_API_BASE}/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Kick user lookup failed: ${res.status} ${await res.text()}`)
  }

  const json = (await res.json()) as { data: KickUser[] }
  const user = json.data?.[0]
  if (!user) throw new Error('Kick user lookup returned no data')
  return user
}

export async function subscribeToChatEvents(accessToken: string): Promise<void> {
  const res = await fetch(`${KICK_API_BASE}/events/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method: 'webhook',
      events: [{ name: 'chat.message.sent', version: 1 }],
    }),
  })

  if (!res.ok) {
    throw new Error(`Kick events subscription failed: ${res.status} ${await res.text()}`)
  }
}

let cachedPublicKey: { key: string; fetchedAt: number } | null = null
const PUBLIC_KEY_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function getWebhookPublicKey(): Promise<string> {
  if (cachedPublicKey && Date.now() - cachedPublicKey.fetchedAt < PUBLIC_KEY_TTL_MS) {
    return cachedPublicKey.key
  }

  const res = await fetch(`${KICK_API_BASE}/public-key`)
  if (!res.ok) {
    throw new Error(`Kick public key lookup failed: ${res.status} ${await res.text()}`)
  }

  const json = (await res.json()) as { data: { public_key: string } }
  const key = json.data.public_key
  cachedPublicKey = { key, fetchedAt: Date.now() }
  return key
}

/**
 * Kick signs webhooks with `{message-id}.{timestamp}.{raw body}` against an
 * RSA key, base64-encoded in the Kick-Event-Signature header. See
 * https://docs.kick.com/events/webhook-security
 */
export function verifyWebhookSignature(params: {
  messageId: string
  timestamp: string
  rawBody: string
  signature: string
  publicKey: string
}): boolean {
  const signedPayload = `${params.messageId}.${params.timestamp}.${params.rawBody}`
  const verifier = createVerify('RSA-SHA256')
  verifier.update(signedPayload)
  verifier.end()

  try {
    return verifier.verify(params.publicKey, params.signature, 'base64')
  } catch {
    return false
  }
}
