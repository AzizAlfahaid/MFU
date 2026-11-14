// iPhone only allows sound after the user has tapped the page once; unlock() must be called from a tap.
let audio: HTMLAudioElement | null = null
let unlocked = false

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio('/sounds/reminder.wav')
    audio.preload = 'auto'
  }
  return audio
}

export const isUnlocked = () => unlocked

export async function unlock(): Promise<void> {
  const a = el()
  try {
    await a.play()
    a.pause()
    a.currentTime = 0
    unlocked = true
  } catch {
    unlocked = false
  }
}

export function startAlarm(): void {
  if (!unlocked) return
  const a = el()
  a.loop = true
  void Promise.resolve(a.play()).catch(() => undefined)
}

export function stopAlarm(): void {
  if (!audio) return
  audio.pause()
  audio.currentTime = 0
}

/** iPhone only plays sound after a tap: unlock on the first tap anywhere, so it never depends on one button. */
export function armAutoUnlock(): void {
  if (unlocked || typeof window === 'undefined') return
  const handler = () => void unlock()
  window.addEventListener('pointerdown', handler, { once: true })
}
