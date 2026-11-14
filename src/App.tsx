import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './screens/Login'
import Onboarding from './screens/Onboarding'
import ElderToday from './screens/elder/ElderToday'
import AppShell from './screens/app/AppShell'
import Placeholder from './screens/app/Placeholder'
import Settings from './screens/app/Settings'

export function AppRoutes() {
  const { t } = useTranslation()
  const { status, profile } = useAuth()
  if (status === 'loading') return <p className="elder">{t('common.loading')}</p>
  if (status === 'signedOut') return <Login />
  if (status === 'noHousehold') return <Onboarding />
  if (profile?.role === 'elder') {
    return (
      <Routes>
        <Route path="/" element={<ElderToday />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/today" replace />} />
        {(['today', 'medicines', 'readings', 'appointments', 'history'] as const).map((tab) => (
          <Route key={tab} path={tab} element={<Placeholder tab={tab} />} />
        ))}
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
