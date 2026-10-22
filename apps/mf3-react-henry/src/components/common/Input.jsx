export function Input({
  value,
  onChange,
  placeholder,
  label,
  type = 'text',
  error,
  disabled = false,
  className = '',
  id,
  name,
  onKeyDown,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
      {label && (
        <label
          htmlFor={id}
          style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={onKeyDown}
        className={`search-input ${className}`}
      />
      {error && (
        <span style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '2px' }}>
          {error}
        </span>
      )}
    </div>
  );
}
