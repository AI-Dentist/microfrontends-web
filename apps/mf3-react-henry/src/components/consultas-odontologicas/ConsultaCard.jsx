import { Card } from '../common/Card.jsx';
import { Button } from '../common/Button.jsx';
import { EstadoConsultaBadge } from './EstadoConsultaBadge.jsx';

/**
 * Tarjeta individual para renderizar una consulta en el listado cronológico.
 *
 * @param {object} props
 * @param {object} props.consulta - ConsultaOdontologicaResponseDto
 * @param {Function} props.onVerDetalle - Callback invocado con el ID de la consulta
 */
export function ConsultaCard({ consulta, onVerDetalle }) {
  if (!consulta) return null;

  const {
    id,
    fechaAtencion,
    estado,
    motivoConsulta,
    odontologoId,
    citaId,
    diagnosticos = [],
    procedimientosRealizados = [],
    version,
  } = consulta;

  const fechaFormateada = fechaAtencion
    ? new Date(fechaAtencion).toLocaleString()
    : 'Fecha no registrada';

  return (
    <Card
      style={{
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        borderLeft:
          estado === 'COMPLETADA'
            ? '4px solid var(--success)'
            : estado === 'CANCELADA'
              ? '4px solid var(--danger)'
              : '4px solid var(--primary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '20px' }}>🦷</span>
          <code style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {id}
          </code>
          <EstadoConsultaBadge estado={estado} />
          <span
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              background: 'var(--neutral-100)',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            v{version}
          </span>
        </div>

        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          📅 <strong>{fechaFormateada}</strong>
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
          MOTIVO DE CONSULTA:
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
          {motivoConsulta || 'Sin motivo especificado'}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px',
          fontSize: '13px',
          background: 'var(--neutral-50)',
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '14px',
        }}
      >
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Odontólogo: </span>
          <strong>{odontologoId || '—'}</strong>
        </div>

        <div>
          <span style={{ color: 'var(--text-muted)' }}>Cita MS3: </span>
          {citaId ? (
            <code style={{ fontSize: '12px', background: 'var(--neutral-200)', padding: '1px 4px' }}>
              {citaId}
            </code>
          ) : (
            <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
              ⚡ Urgencia / Sin cita
            </span>
          )}
        </div>

        <div>
          <span style={{ color: 'var(--text-muted)' }}>Diagnósticos: </span>
          <strong>{diagnosticos.length}</strong>
        </div>

        <div>
          <span style={{ color: 'var(--text-muted)' }}>Procedimientos: </span>
          <strong>{procedimientosRealizados.length}</strong>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <Button
          variant="secondary"
          onClick={() => onVerDetalle && onVerDetalle(id)}
          style={{ fontSize: '13px', padding: '6px 14px' }}
        >
          🔍 Ver Detalle Clínico
        </Button>
      </div>
    </Card>
  );
}
