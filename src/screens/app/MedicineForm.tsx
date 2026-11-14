import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import ErrorRetry from '../../components/ErrorRetry'
import PhotoInput from '../../components/PhotoInput'
import StoredPhoto from '../../components/StoredPhoto'
import { saveMedication, type MedicationWithTimes } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { uploadPhoto } from '../../lib/files'

export default function MedicineForm({ initial, onSaved, onCancel }: {
  initial?: MedicationWithTimes; onSaved: () => void; onCancel: () => void
}) {
  const { t } = useTranslation()
  const { household } = useAuth()
  const [name, setName] = useState(initial?.name ?? '')
  const [dose, setDose] = useState(initial?.dose ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [photo, setPhoto] = useState<string | null>(initial?.photo_path ?? null)
  const [active, setActive] = useState(initial?.active ?? true)
  const [times, setTimes] = useState<string[]>(initial?.times.length ? initial.times : [''])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File) {
    try { setPhoto(await uploadPhoto(household!.id, 'medications', file)) } catch { setError(t('common.error')) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const clean = [...new Set(times.filter(Boolean))].sort()
    if (!name.trim()) return setError(t('medicines.errName'))
    if (!dose.trim()) return setError(t('medicines.errDose'))
    if (!clean.length) return setError(t('medicines.errTimes'))
    setBusy(true)
    try {
      await saveMedication({ id: initial?.id, name: name.trim(), dose: dose.trim(), notes: notes.trim() || null, photo_path: photo, active, times: clean })
      onSaved()
    } catch {
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>{initial ? t('medicines.edit') : t('medicines.add')}</h2>
      <label>{t('medicines.name')}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>{t('medicines.dose')}<input value={dose} onChange={(e) => setDose(e.target.value)} /></label>
      <label>{t('medicines.notes')}<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <fieldset>
        <legend>{t('medicines.times')}</legend>
        {times.map((v, i) => (
          <div key={i} className="row">
            <label>{t('medicines.time')}
              <input type="time" value={v} onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} />
            </label>
            {times.length > 1 && (
              <button type="button" onClick={() => setTimes(times.filter((_, j) => j !== i))}>{t('medicines.removeTime')}</button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setTimes([...times, ''])}>{t('medicines.addTime')}</button>
      </fieldset>
      <StoredPhoto path={photo} alt={name} size={160} />
      <PhotoInput label={photo ? t('medicines.changePhoto') : t('medicines.addPhoto')} onPick={(f) => void pick(f)} />
      <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {t('medicines.active')}</label>
      {error && <ErrorRetry message={error} />}
      <button type="submit" disabled={busy}>{t('common.save')}</button>
      <button type="button" onClick={onCancel}>{t('common.cancel')}</button>
    </form>
  )
}
