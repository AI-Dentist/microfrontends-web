export function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--border-color)',
        padding: '16px 24px',
        textAlign: 'center',
        fontSize: '12px',
        color: 'var(--text-muted)',
        background: 'var(--bg-surface)',
        marginTop: 'auto',
      }}
    >
      <p style={{ margin: 0 }}>
        Sistema Médico-Odontológico Distribuido • MS2 Clínico-IA (NestJS / MongoDB) • API Gateway Nginx (Puerto 80)
      </p>
      <p style={{ margin: '4px 0 0', opacity: 0.8 }}>
        Arquitectura Hexagonal & Microfrontends • MF3 React (Henry)
      </p>
    </footer>
  );
}
