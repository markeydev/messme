'use client'

import { useEffect } from 'react'
import { getAuthToken } from '@/lib/api'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i)
  }
  return output.buffer as ArrayBuffer
}

export function usePushNotifications(isAuthenticated = false, notificationsEnabled = true) {
  useEffect(() => {
    if (!isAuthenticated) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return

    const setup = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        const existing = await registration.pushManager.getSubscription()

        if (!notificationsEnabled) {
          if (existing) {
            const token = getAuthToken()
            const endpoint = existing.endpoint
            try {
              await existing.unsubscribe()
            } catch (err) {
              console.error('Push unsubscribe browser error:', err)
            }
            if (token && endpoint) {
              try {
                await fetch('/api/push/subscribe', {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                  },
                  body: JSON.stringify({ endpoint }),
                })
              } catch (err) {
                console.error('Push unsubscribe API error:', err)
              }
            }
          }
          return
        }

        const permission = Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission()
        if (permission !== 'granted') return

        const subscription = existing ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        })

        const token = getAuthToken()
        if (!token) return
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(subscription.toJSON()),
        })
      } catch (err) {
        console.error('Push setup error:', err)
      }
    }

    setup()
  }, [isAuthenticated, notificationsEnabled])
}
