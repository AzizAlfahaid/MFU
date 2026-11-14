import { useTranslation } from 'react-i18next'

export default function ElderToday() {
  const { t } = useTranslation()
  return (
    <main className="elder">
      <h1>{t('elder.today')}</h1>
    </main>
  )
}
