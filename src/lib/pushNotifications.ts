import webpush from 'web-push'
import { db } from '@/lib/db'

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@messme.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export async function sendPushToUsers(userIds: string[], payload: { title: string; body: string; url?: string }) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return
  if (userIds.length === 0) return

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  })
  if (subscriptions.length === 0) return

  const serializedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
  })

  await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        serializedPayload
      ).catch(async (err) => {
        if (err?.statusCode === 410) {
          await db.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch((dbErr) => {
            console.error('Failed to delete expired push subscription:', dbErr)
          })
          return
        }
        console.error('Push send failed:', err)
      })
    )
  )
}
