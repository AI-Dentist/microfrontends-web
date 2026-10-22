export function Card({ children, title, action, className = '' }) {
  return (
    <div className={`clinic-card ${className}`}>
      {(title || action) && (
        <div className="clinic-card-header">
          {title && <h2 className="clinic-card-title">{title}</h2>}
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
