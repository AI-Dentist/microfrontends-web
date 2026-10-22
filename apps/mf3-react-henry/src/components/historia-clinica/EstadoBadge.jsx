import { Badge } from '../common/Badge.jsx';

export function EstadoBadge({ estado }) {
  const estadoStr = String(estado || '').toUpperCase();

  let variant = 'archivada';
  let label = estadoStr || 'DESCONOCIDO';

  if (estadoStr === 'ACTIVA') {
    variant = 'activa';
    label = 'ACTIVA';
  } else if (estadoStr === 'CERRADA') {
    variant = 'cerrada';
    label = 'CERRADA';
  } else if (estadoStr === 'ARCHIVADA') {
    variant = 'archivada';
    label = 'ARCHIVADA';
  }

  return <Badge variant={variant}>{label}</Badge>;
}
