import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getWebhookPublicKey, verifyWebhookSignature } from '../_lib/kick'
import { recordChatActivity } from '../_lib/points'
import { redis } from '../_lib/redis'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

interface ChatMessageSentEvent {
  message_id: string
  broadcaster: { user_id: number }
  sender: { user_id: number; username: string; is_anonymous?: boolean; profile_picture?: string }
  content: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const messageId = req.headers['kick-event-message-id']
  const timestamp = req.headers['kick-event-message-timestamp']
  const signature = req.headers['kick-event-signature']
  const eventType = req.headers['kick-event-type']

  const rawBody = await readRawBody(req)

  if (typeof messageId !== 'string' || typeof timestamp !== 'string' || typeof signature !== 'string') {
    res.status(400).send('Missing webhook headers')
    return
  }

  if (process.env.KICK_SKIP_WEBHOOK_VERIFICATION !== 'true') {
    const publicKey = await getWebhookPublicKey()
    const valid = verifyWebhookSignature({ messageId, timestamp, rawBody, signature, publicKey })
    if (!valid) {
      res.status(401).send('Invalid signature')
      return
    }
  }

  // Kick retries delivery until it gets a 200, so dedupe on message id.
  const seen = await redis.set(`webhook:seen:${messageId}`, '1', { nx: true, ex: 3600 })
  if (seen === null) {
    res.status(200).send('Duplicate')
    return
  }

  if (eventType === 'chat.message.sent') {
    const event = JSON.parse(rawBody) as ChatMessageSentEvent
    const sender = event.sender

    if (sender && !sender.is_anonymous && sender.user_id !== event.broadcaster?.user_id) {
      const nowSeconds = Math.floor(new Date(timestamp).getTime() / 1000) || Math.floor(Date.now() / 1000)
      await recordChatActivity(sender.user_id, sender.username, sender.profile_picture, nowSeconds)
    }
  }

  res.status(200).send('OK')
}
