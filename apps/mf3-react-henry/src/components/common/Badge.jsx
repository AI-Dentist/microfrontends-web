export function Badge({ children, variant = 'neutral', className = '' }) {
  const normalizedVariant = String(variant).toLowerCase();
  return (
    <span className={`status-badge ${normalizedVariant} ${className}`}>
      {children}
    </span>
  );
}
