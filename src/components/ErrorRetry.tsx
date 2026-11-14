import { useTranslation } from 'react-i18next'
import BigButton from './BigButton'

export default function ErrorRetry({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="error-box">
      <p className="error">{message}</p>
      {onRetry && <BigButton label={t('common.retry')} onClick={onRetry} />}
    </div>
  )
}
