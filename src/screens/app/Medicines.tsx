import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ErrorRetry from '../../components/ErrorRetry'
import PhotoInput from '../../components/PhotoInput'
import StoredPhoto from '../../components/StoredPhoto'
import { deleteMedication, listMedications, setMedicationPhoto, type MedicationWithTimes } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { uploadPhoto } from '../../lib/files'
import MedicineForm from './MedicineForm'

export default function Medicines() {
  const { t } = useTranslation()
  const { profile, household } = useAuth()
  const isFamily = profile?.role === 'family'
  const [meds, setMeds] = useState<MedicationWithTimes[] | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState<MedicationWithTimes | 'new' | null>(null)

  const load = useCallback(() => {
    setError(false)
    listMedications().then(setMeds).catch(() => setError(true))
  }, [])
  useEffect(load, [load])

  async function changePhoto(m: MedicationWithTimes, file: File) {
    try {
      await setMedicationPhoto(m.id, await uploadPhoto(household!.id, 'medications', file))
      load()
    } catch { setError(true) }
  }

  async function remove(m: MedicationWithTimes) {
    if (!window.confirm(t('medicines.confirmDelete', { name: m.name }))) return
    try { await deleteMedication(m.id); load() } catch { setError(true) }
  }

  if (editing) {
    return <MedicineForm initial={editing === 'new' ? undefined : editing} onSaved={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
  }

  return (
    <div>
      <h1>{t('tabs.medicines')}</h1>
      {isFamily && <button type="button" onClick={() => setEditing('new')}>{t('medicines.add')}</button>}
      {error && <ErrorRetry message={t('common.error')} onRetry={load} />}
      {meds?.length === 0 && <p>{t('medicines.none')}</p>}
      <ul className="cards">
        {meds?.map((m) => (
          <li key={m.id} className={m.active ? '' : 'inactive'}>
            <StoredPhoto path={m.photo_path} alt={m.name} />
            <div>
              <strong>{m.name}</strong> — {m.dose}
              <div>{m.times.join(' · ')}</div>
              {m.notes && <div className="muted">{m.notes}</div>}
              {!m.active && <div className="muted">{t('medicines.stopped')}</div>}
            </div>
            <PhotoInput label={t('medicines.changePhoto')} testId={`photo-input-${m.id}`} onPick={(f) => void changePhoto(m, f)} />
            {isFamily && (
              <>
                <button type="button" onClick={() => setEditing(m)}>{t('common.edit')}</button>
                <button type="button" onClick={() => void remove(m)}>{t('common.delete')}</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
