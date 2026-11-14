import type { Lang, ReadingType, SugarContext } from './types'

const list = (lang: Lang, names: string[]) => names.join(lang === 'ar' ? '، ' : ', ')

export function doseReminderText(lang: Lang, time: string, medNames: string[]): { title: string; body: string } {
  return lang === 'ar'
    ? { title: 'وقت الدواء', body: `حان موعد الدواء (${time}): ${list(lang, medNames)}` }
    : { title: 'Medicine time', body: `It is time for your medicine (${time}): ${list(lang, medNames)}` }
}

export function missedDoseText(lang: Lang, time: string, medNames: string[]): string {
  return lang === 'ar'
    ? `⚠️ لم يتم تسجيل أخذ الدواء في موعده (${time}): ${list(lang, medNames)}`
    : `⚠️ Dose not marked as taken (${time}): ${list(lang, medNames)}`
}

export function lateTakenText(lang: Lang, time: string, medNames: string[]): string {
  return lang === 'ar'
    ? `✅ تم أخذ الدواء متأخراً (موعده ${time}): ${list(lang, medNames)}`
    : `✅ Dose taken late (due ${time}): ${list(lang, medNames)}`
}

const TYPE_AR: Record<ReadingType, string> = { sugar: 'السكر', bp: 'الضغط', temp: 'الحرارة' }
const TYPE_EN: Record<ReadingType, string> = { sugar: 'Blood sugar', bp: 'Blood pressure', temp: 'Temperature' }
const CTX_AR: Record<SugarContext, string> = { fasting: 'صائم', after_meal: 'بعد الأكل', other: 'وقت آخر' }
const CTX_EN: Record<SugarContext, string> = { fasting: 'fasting', after_meal: 'after meal', other: 'other time' }

export function readingAlertText(
  lang: Lang, r: { type: ReadingType; context: SugarContext | null; value1: number; value2?: number | null },
): string {
  const value = r.type === 'bp' && r.value2 != null ? `${r.value1}/${r.value2}` : String(r.value1)
  if (lang === 'ar') {
    const ctx = r.context ? ` (${CTX_AR[r.context]})` : ''
    return `⚠️ قراءة ${TYPE_AR[r.type]}${ctx}: ${value} — خارج النطاق المحدد.`
  }
  const ctx = r.context ? ` (${CTX_EN[r.context]})` : ''
  return `⚠️ ${TYPE_EN[r.type]}${ctx}: ${value} — outside the set range.`
}

export function appointmentText(
  lang: Lang, when: 'day_before' | 'day_of', time: string, hospital: string | null, doctor: string | null,
): string {
  const where = [hospital, doctor].filter(Boolean).join(' — ')
  if (lang === 'ar') {
    return `📅 ${when === 'day_before' ? 'موعد غداً' : 'موعد اليوم'} الساعة ${time}${where ? ` — ${where}` : ''}`
  }
  return `📅 Appointment ${when === 'day_before' ? 'tomorrow' : 'today'} at ${time}${where ? ` — ${where}` : ''}`
}

export const appTitle = (lang: Lang): string => (lang === 'ar' ? 'المتابعة الطبية' : 'Medical Follow-Up')
