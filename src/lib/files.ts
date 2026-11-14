import { supabase } from './supabase'

const BUCKET = 'household-files'

/** Shrinks a phone photo to a JPEG (also converts HEIC where Safari can decode it). */
export async function resizeImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
    return blob ?? file
  } catch {
    return file
  }
}

export async function uploadPhoto(householdId: string, folder: 'medications' | 'readings', file: File): Promise<string> {
  const blob = await resizeImage(file)
  const path = `${householdId}/${folder}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  return path
}

const cache = new Map<string, { url: string; expires: number }>()
const TTL = 3600

export async function signedUrl(path: string): Promise<string> {
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now() + 5 * 60_000) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL)
  if (error || !data) throw new Error(error?.message ?? 'no link')
  cache.set(path, { url: data.signedUrl, expires: Date.now() + TTL * 1000 })
  return data.signedUrl
}
