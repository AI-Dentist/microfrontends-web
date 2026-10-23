import { Badge } from '../common/Badge.jsx';

/**
 * Badge visual con semántica clínica para los estados de Consulta Odontológica.
 *
 * @param {object} props
 * @param {'EN_CURSO'|'COMPLETADA'|'CANCELADA'|string} props.estado
 */
export function EstadoConsultaBadge({ estado }) {
  if (!estado) return null;

  switch (estado) {
    case 'EN_CURSO':
      return (
        <Badge
          variant="primary"
          style={{
            background: 'var(--primary-light)',
            color: 'var(--primary-dark)',
            border: '1px solid var(--primary)',
            fontWeight: 700,
          }}
        >
          ⏳ EN CURSO
        </Badge>
      );
    case 'COMPLETADA':
      return (
        <Badge
          variant="success"
          style={{
            background: 'var(--success-bg)',
            color: 'var(--success)',
            border: '1px solid var(--success-border)',
            fontWeight: 700,
          }}
        >
          ✅ COMPLETADA
        </Badge>
      );
    case 'CANCELADA':
      return (
        <Badge
          variant="danger"
          style={{
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            border: '1px solid var(--danger-border)',
            fontWeight: 700,
          }}
        >
          ⛔ CANCELADA
        </Badge>
      );
    default:
      return <Badge variant="neutral">{estado}</Badge>;
  }
}
