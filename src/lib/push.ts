import { registerPush, unregisterPush as removePushRow } from './api'

export type PushResult = 'enabled' | 'denied' | 'unsupported' | 'needs_home_screen'

export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && !!navigator.serviceWorker && 'PushManager' in window && 'Notification' in window
}

function keyBytes(base64Url: string): Uint8Array {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

/** Must be called from a tap. On iPhone it only works once the page has been added to the Home Screen. */
export async function enablePush(): Promise<PushResult> {
  if (isIos() && !isStandalone()) return 'needs_home_screen'
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!pushSupported() || !vapid) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) as BufferSource })
  const json = sub.toJSON()
  await registerPush({ endpoint: json.endpoint!, p256dh: json.keys!.p256dh, auth: json.keys!.auth })
  return 'enabled'
}

/** True when this device already has permission and a subscription. */
export async function pushIsOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) !== null
  } catch {
    return false
  }
}

/** On every start after sign-in: make sure this device's subscription belongs to whoever is signed in. */
export async function syncPush(): Promise<void> {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
    if (!sub) return
    const j = sub.toJSON()
    await registerPush({ endpoint: j.endpoint!, p256dh: j.keys!.p256dh, auth: j.keys!.auth })
  } catch { /* best effort */ }
}

/** On sign-out: this device stops receiving the previous person's alerts. */
export async function unregisterPush(): Promise<void> {
  try {
    if (!pushSupported()) return
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
    if (!sub) return
    await removePushRow(sub.endpoint)
    await sub.unsubscribe()
  } catch { /* best effort */ }
}
