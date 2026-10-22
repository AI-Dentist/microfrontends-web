import { Spinner } from './Spinner.jsx';

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
  icon = null,
}) {
  const btnClass = variant === 'secondary' ? 'btn-secondary' : 'btn-primary';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${btnClass} ${className}`}
    >
      {loading ? <Spinner /> : icon}
      <span>{children}</span>
    </button>
  );
}
