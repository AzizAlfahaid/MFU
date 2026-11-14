import { useTranslation } from 'react-i18next'

export default function Placeholder({ tab }: { tab: string }) {
  const { t } = useTranslation()
  return <h1>{t(`tabs.${tab}`)}</h1>
}
