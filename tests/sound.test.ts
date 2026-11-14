import { beforeEach, expect, it, vi } from 'vitest'

let play: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>
async function fresh() {
  vi.resetModules()
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause })
  return import('../src/lib/sound')
}
beforeEach(() => vi.clearAllMocks())

it('starts locked and does not throw or play when started locked', async () => {
  const s = await fresh()
  expect(s.isUnlocked()).toBe(false)
  expect(() => s.startAlarm()).not.toThrow()
  expect(play).not.toHaveBeenCalled()
})
it('unlock plays once from a tap, then pauses, and marks sound as unlocked', async () => {
  const s = await fresh()
  await s.unlock()
  expect(play).toHaveBeenCalledTimes(1)
  expect(pause).toHaveBeenCalled()
  expect(s.isUnlocked()).toBe(true)
})
it('stays locked if the browser refuses to play', async () => {
  const s = await fresh()
  play.mockRejectedValueOnce(new Error('NotAllowedError'))
  await s.unlock()
  expect(s.isUnlocked()).toBe(false)
})
it('the alarm loops once unlocked and stops on request', async () => {
  const s = await fresh()
  await s.unlock()
  play.mockClear()
  s.startAlarm()
  expect(play).toHaveBeenCalledTimes(1)
  s.stopAlarm()
  expect(pause).toHaveBeenCalled()
})
