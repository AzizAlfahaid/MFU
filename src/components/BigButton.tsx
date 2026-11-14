export default function BigButton({
  label,
  onClick,
  variant = 'primary',
  disabled,
}: {
  label: string
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}) {
  return (
    <button type="button" className={`big-button ${variant}`} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  )
}
