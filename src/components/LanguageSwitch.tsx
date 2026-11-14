import { useTranslation } from 'react-i18next'
import { setLanguage, type Lang } from '../i18n'

export default function LanguageSwitch({ onChange }: { onChange?: (l: Lang) => void }) {
  const { i18n, t } = useTranslation()
  const next: Lang = i18n.language === 'ar' ? 'en' : 'ar'
  return (
    <button
      type="button"
      className="lang-switch"
      onClick={() => {
        setLanguage(next)
        onChange?.(next)
      }}
    >
      {t('lang.switchTo')}
    </button>
  )
}
