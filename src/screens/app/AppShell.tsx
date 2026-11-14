import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitch from '../../components/LanguageSwitch'
import { updateMyLang } from '../../lib/api'

const TABS = ['today', 'medicines', 'readings', 'appointments', 'history', 'settings'] as const

export default function AppShell() {
  const { t } = useTranslation()
  return (
    <div className="shell">
      <header>
        <strong>{t('app.name')}</strong>
        <LanguageSwitch onChange={(l) => void updateMyLang(l).catch(() => undefined)} />
      </header>
      <main><Outlet /></main>
      <nav aria-label={t('tabs.label')}>
        {TABS.map((tab) => (
          <NavLink key={tab} to={`/${tab}`}>{t(`tabs.${tab}`)}</NavLink>
        ))}
      </nav>
    </div>
  )
}
