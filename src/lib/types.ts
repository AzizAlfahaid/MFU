export type Role = 'elder' | 'helper' | 'family'
export type DoseStatus = 'pending' | 'taken' | 'taken_late' | 'missed'
export type ReadingType = 'sugar' | 'bp' | 'temp'
export type SugarContext = 'fasting' | 'after_meal' | 'other'
export type RangeKey = 'sugar_fasting' | 'sugar_after_meal' | 'sugar_other' | 'bp_systolic' | 'bp_diastolic' | 'temp'

export interface Household {
  id: string
  name: string
  timezone: string
  missed_wait_minutes: number
}

// Never `select *` from profiles: telegram_* columns are not readable by clients.
export interface Profile {
  id: string
  household_id: string
  role: Role
  display_name: string
  lang: 'ar' | 'en'
}

export interface Medication {
  id: string
  household_id: string
  name: string
  dose: string
  notes: string | null
  photo_path: string | null
  active: boolean
}

export interface MedicationTime {
  id: string
  medication_id: string
  time_of_day: string // 'HH:MM:SS'
}

export interface Dose {
  id: string
  medication_id: string
  scheduled_at: string
  status: DoseStatus
  taken_at: string | null
  taken_by: string | null
  reminder_sent_at: string | null
  missed_alert_sent_at: string | null
  late_alert_sent_at: string | null
}

export interface Reading {
  id: string
  type: ReadingType
  context: SugarContext | null
  value1: number
  value2: number | null
  pulse: number | null
  taken_at: string
  entered_by: string | null
  photo_path: string | null
  source: 'typed' | 'photo'
  out_of_range: boolean
}

export interface Range {
  id: string
  key: RangeKey
  low: number
  high: number
}

export interface Hospital {
  id: string
  name: string
}

export interface Appointment {
  id: string
  starts_at: string
  hospital_id: string | null
  doctor: string | null
  purpose: string | null
  notes: string | null
}

export interface Member {
  id: string
  role: Role
  display_name: string
  lang: 'ar' | 'en'
  has_telegram: boolean
}
