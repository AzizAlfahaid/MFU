import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './screens/Login'
import Onboarding from './screens/Onboarding'
import ElderToday from './screens/elder/ElderToday'
import AppShell from './screens/app/AppShell'
import Medicines from './screens/app/Medicines'
import AddReading from './screens/elder/AddReading'
import Appointments from './screens/app/Appointments'
import History from './screens/app/History'
import Readings from './screens/app/Readings'
import SetupGuide from './screens/app/SetupGuide'
import Today from './screens/app/Today'
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
        <Route path="/add-reading" element={<AddReading />} />
        <Route path="/setup" element={<SetupGuide />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/today" replace />} />
        <Route path="today" element={<Today />} />
        <Route path="readings" element={<Readings />} />
        <Route path="add-reading" element={<AddReading />} />
        <Route path="history" element={<History />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="medicines" element={<Medicines />} />
        <Route path="settings" element={<Settings />} />
        <Route path="setup" element={<SetupGuide />} />
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
