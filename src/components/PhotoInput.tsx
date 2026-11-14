import { useRef } from 'react'

/** A big button that opens the camera (or photo library) and hands back the chosen file. */
export default function PhotoInput({ label, onPick, testId }: { label: string; onPick: (file: File) => void; testId?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className="big-button secondary" onClick={() => ref.current?.click()}>{label}</button>
      <input
        ref={ref} type="file" accept="image/*" capture="environment" hidden data-testid={testId}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = ''
        }}
      />
    </>
  )
}
