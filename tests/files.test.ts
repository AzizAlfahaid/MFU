import { beforeEach, expect, it, vi } from 'vitest'

const upload = vi.fn().mockResolvedValue({ error: null })
const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/1' }, error: null })
vi.mock('../src/lib/supabase', () => ({
  supabase: { storage: { from: vi.fn(() => ({ upload, createSignedUrl })) } },
}))
import { signedUrl, uploadPhoto } from '../src/lib/files'

beforeEach(() => vi.clearAllMocks())

it('uploads under the household folder with a random jpg name', async () => {
  const path = await uploadPhoto('hid-1', 'medications', new File(['x'], 'a.heic', { type: 'image/heic' }))
  expect(path).toMatch(/^hid-1\/medications\/[0-9a-f-]{36}\.jpg$/)
  expect(upload).toHaveBeenCalledWith(path, expect.anything(), expect.objectContaining({ contentType: 'image/jpeg' }))
})
it('fails loudly when the upload fails', async () => {
  upload.mockResolvedValueOnce({ error: { message: 'nope' } })
  await expect(uploadPhoto('h', 'readings', new File(['x'], 'a.jpg'))).rejects.toThrow('nope')
})
it('caches signed links per path', async () => {
  await signedUrl('h/medications/cached.jpg')
  await signedUrl('h/medications/cached.jpg')
  expect(createSignedUrl).toHaveBeenCalledTimes(1)
  expect(createSignedUrl).toHaveBeenCalledWith('h/medications/cached.jpg', 3600)
})
