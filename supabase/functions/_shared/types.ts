export type Lang = 'ar' | 'en'
export type Role = 'elder' | 'helper' | 'family'
export type DoseStatus = 'pending' | 'taken' | 'taken_late' | 'missed'
export type ReadingType = 'sugar' | 'bp' | 'temp'
export type SugarContext = 'fasting' | 'after_meal' | 'other'
export type RangeKey = 'sugar_fasting' | 'sugar_after_meal' | 'sugar_other' | 'bp_systolic' | 'bp_diastolic' | 'temp'

export interface MedTime { medication_id: string; name: string; time_of_day: string }
export interface DoseRow {
  id: string
  medication_id: string
  name: string
  scheduled_at: string
  status: DoseStatus
  reminder_sent_at: string | null
  missed_alert_sent_at: string | null
  late_alert_sent_at: string | null
}
export interface Slot { scheduled_at: string; doses: DoseRow[] }
export interface ApptRow {
  id: string
  starts_at: string
  hospital: string | null
  doctor: string | null
  purpose: string | null
  day_before_sent_at: string | null
  day_of_sent_at: string | null
}
