import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/api', () => ({ registerPush: vi.fn().mockResolvedValue(undefined), unregisterPush: vi.fn().mockResolvedValue(undefined) }))
import * as api from '../src/lib/api'

const setUa = (ua: string) => Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36'

async function load(standalone: boolean) {
  vi.resetModules()
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U')
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: standalone }) })
  return import('../src/lib/push')
}
function fakeBrowser(permission: 'granted' | 'denied') {
  const subscription = { toJSON: () => ({ endpoint: 'https://push/e', keys: { p256dh: 'P', auth: 'A' } }) }
  const reg = { pushManager: { subscribe: vi.fn().mockResolvedValue(subscription), getSubscription: vi.fn().mockResolvedValue(null) } }
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue(permission) } })
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg) } })
  return reg
}

beforeEach(() => {
  vi.clearAllMocks()
  // @ts-expect-error cleanup of stubs between tests
  delete window.PushManager
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: undefined })
})

describe('enablePush', () => {
  it('asks iPhone users in Safari to add the page to the Home Screen first', async () => {
    setUa(IPHONE)
    const push = await load(false)
    expect(push.isIos()).toBe(true)
    expect(await push.enablePush()).toBe('needs_home_screen')
  })
  it('reports unsupported browsers', async () => {
    setUa(ANDROID)
    const push = await load(false)
    expect(await push.enablePush()).toBe('unsupported')
  })
  it('reports a refusal', async () => {
    setUa(ANDROID)
    fakeBrowser('denied')
    const push = await load(false)
    expect(await push.enablePush()).toBe('denied')
    expect(api.registerPush).not.toHaveBeenCalled()
  })
  it('subscribes and registers the device when allowed (installed iPhone)', async () => {
    setUa(IPHONE)
    const reg = fakeBrowser('granted')
    const push = await load(true)
    expect(await push.enablePush()).toBe('enabled')
    expect(reg.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }))
    expect(api.registerPush).toHaveBeenCalledWith({ endpoint: 'https://push/e', p256dh: 'P', auth: 'A' })
  })
})

describe('device ownership follows the signed-in person', () => {
  function withSubscription(sub: unknown) {
    const reg = { pushManager: { getSubscription: vi.fn().mockResolvedValue(sub), subscribe: vi.fn() } }
    Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted', requestPermission: vi.fn() } })
    Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg) } })
  }
  const sub = () => ({ endpoint: 'https://push/e', toJSON: () => ({ endpoint: 'https://push/e', keys: { p256dh: 'P', auth: 'A' } }), unsubscribe: vi.fn().mockResolvedValue(true) })

  it('re-registers this device\'s existing subscription for whoever is signed in', async () => {
    setUa(IPHONE)
    withSubscription(sub())
    const push = await load(true)
    await push.syncPush()
    expect(api.registerPush).toHaveBeenCalledWith({ endpoint: 'https://push/e', p256dh: 'P', auth: 'A' })
  })
  it('does nothing when the device has no subscription', async () => {
    setUa(IPHONE)
    withSubscription(null)
    const push = await load(true)
    await push.syncPush()
    expect(api.registerPush).not.toHaveBeenCalled()
  })
  it('on sign-out removes the subscription from the account and the device', async () => {
    setUa(IPHONE)
    const s = sub()
    withSubscription(s)
    const push = await load(true)
    await push.unregisterPush()
    expect(api.unregisterPush).toHaveBeenCalledWith('https://push/e')
    expect(s.unsubscribe).toHaveBeenCalled()
  })
  it('never throws when push is not available', async () => {
    setUa(ANDROID)
    const push = await load(false)
    await expect(push.syncPush()).resolves.toBeUndefined()
    await expect(push.unregisterPush()).resolves.toBeUndefined()
  })
})
