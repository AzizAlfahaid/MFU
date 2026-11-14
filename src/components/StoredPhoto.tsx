import { useEffect, useState } from 'react'
import { signedUrl } from '../lib/files'

export default function StoredPhoto({ path, alt, size = 96 }: { path: string | null; alt: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (path) signedUrl(path).then((u) => live && setUrl(u)).catch(() => undefined)
    return () => { live = false }
  }, [path])
  if (!path || !url) return <div className="photo-empty" style={{ width: size, height: size }} aria-hidden />
  return <img src={url} alt={alt} style={{ width: size, height: size, objectFit: 'cover', borderRadius: 12 }} />
}
