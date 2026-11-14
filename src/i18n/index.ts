import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './ar.json'
import en from './en.json'

export type Lang = 'ar' | 'en'

function stored(): Lang {
  try {
    const v = localStorage.getItem('mfu.lang')
    return v === 'en' ? 'en' : 'ar'
  } catch {
    return 'ar'
  }
}

export function applyDocument(lang: Lang) {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

export function setLanguage(lang: Lang): void {
  void i18n.changeLanguage(lang)
  applyDocument(lang)
  try {
    localStorage.setItem('mfu.lang', lang)
  } catch {
    /* storage unavailable */
  }
}

const initial = stored()
void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
})
applyDocument(initial)

export default i18n
