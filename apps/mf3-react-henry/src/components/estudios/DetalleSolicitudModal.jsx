import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';

export function DetalleSolicitudModal({
  isOpen,
  onClose,
  solicitud,
  onRegistrarResultadoClick,
  onCambiarEstadoClick,
}) {
  if (!isOpen || !solicitud) return null;

  const {
    id,
    historiaClinicaId,
    consultaId,
    categoria,
    codigoEstudio,
    nombreEstudio,
    motivo,
    prioridad,
    estado,
    indicaciones,
    odontologoId,
    fechaSolicitud,
    resultado,
  } = solicitud;

  const getBadgeVariant = (st) => {
    switch (st) {
      case 'SOLICITADO': return 'info';
      case 'EN_PROCESO': return 'warning';
      case 'COMPLETADO': return 'success';
      case 'CANCELADO': return 'danger';
      default: return 'neutral';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`🔬 Ficha de Estudio Clínico (${id})`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>
              {nombreEstudio}
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Código: <code>{codigoEstudio}</code> • Categoría: <strong>{categoria}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Badge variant={prioridad === 'URGENTE' ? 'danger' : 'neutral'}>
              {prioridad === 'URGENTE' ? '🚨 URGENTE' : 'RUTINA'}
            </Badge>
            <Badge variant={getBadgeVariant(estado)}>
              {estado}
            </Badge>
          </div>
        </div>

        {/* Datos Clínicos de Solicitud */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '13px' }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Historia Clínica:</span>
            <div style={{ fontWeight: 600 }}>{historiaClinicaId}</div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Consulta Asociada:</span>
            <div style={{ fontWeight: 600 }}>{consultaId}</div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Odontólogo Solicitante:</span>
            <div style={{ fontWeight: 600 }}>{odontologoId}</div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Fecha de Solicitud:</span>
            <div style={{ fontWeight: 600 }}>
              {fechaSolicitud ? new Date(fechaSolicitud).toLocaleString() : 'N/D'}
            </div>
          </div>
        </div>

        <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', fontSize: '13px' }}>
          <strong style={{ display: 'block', marginBottom: '4px' }}>Motivo Clínico:</strong>
          <div>{motivo}</div>
        </div>

        {indicaciones && (
          <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', fontSize: '13px' }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>Indicaciones Técnicas:</strong>
            <div>{indicaciones}</div>
          </div>
        )}

        {/* Sección de Resultado Clínico */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: '15px', color: 'var(--text-primary)' }}>
            📊 Resultado e Informe Clínico
          </h4>

          {resultado ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', fontSize: '13px' }}>
              <div>
                <strong>Resumen Diagnóstico:</strong>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{resultado.resumen}</p>
              </div>

              {resultado.observaciones && (
                <div>
                  <strong>Observaciones:</strong>
                  <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{resultado.observaciones}</p>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)', fontSize: '12px', color: 'var(--text-muted)' }}>
                {resultado.laboratorioId && (
                  <span>🏥 Laboratorio: <strong>{resultado.laboratorioId}</strong></span>
                )}
                <span>👨‍⚕️ Registrado por: <strong>{resultado.registradoPor || 'N/D'}</strong></span>
                <span>📅 Fecha informe: <strong>{resultado.fechaResultado ? new Date(resultado.fechaResultado).toLocaleString() : 'N/D'}</strong></span>
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '13px' }}>
              ℹ️ Aún no se ha registrado resultado para este estudio.
            </div>
          )}
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
          {estado !== 'COMPLETADO' && estado !== 'CANCELADO' && (
            <>
              {onCambiarEstadoClick && (
                <Button variant="secondary" onClick={() => onCambiarEstadoClick(solicitud)}>
                  🔄 Cambiar Estado
                </Button>
              )}
              {onRegistrarResultadoClick && (
                <Button variant="primary" onClick={() => onRegistrarResultadoClick(solicitud)}>
                  📋 Registrar Resultado
                </Button>
              )}
            </>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
