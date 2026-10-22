import { Card } from '../common/Card.jsx';
import { Button } from '../common/Button.jsx';
import { EstadoBadge } from './EstadoBadge.jsx';
import { AntecedentesSection } from './AntecedentesSection.jsx';
import { AlergiasTable } from './AlergiasTable.jsx';
import { MedicamentosList } from './MedicamentosList.jsx';
import { AuditoriaTimeline } from './AuditoriaTimeline.jsx';

export function HistoriaClinicaDetail({ historia, onEditarAntecedentes }) {
  if (!historia) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Tarjeta de Encabezado / Resumen */}
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ fontSize: '24px' }}>📋</span>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
                Expediente: <code style={{ fontSize: '18px' }}>{historia.id}</code>
              </h2>
              <EstadoBadge estado={historia.estado} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px 24px',
                marginTop: '16px',
                fontSize: '14px',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Identificador del Paciente:</span>
                <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '15px' }}>
                  {historia.pacienteId}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Odontólogo Responsable:</span>
                <div style={{ fontWeight: 600 }}>{historia.odontologoResponsableId}</div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Versión de Concurrencia:</span>
                <div>
                  <span
                    style={{
                      background: 'var(--primary-light)',
                      color: 'var(--primary-dark)',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '13px',
                    }}
                  >
                    v{historia.version}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Fecha de Creación:</span>
                <div style={{ fontSize: '13px' }}>
                  {historia.creadoEn ? new Date(historia.creadoEn).toLocaleString() : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {historia.observacionesGenerales && (
          <div
            style={{
              marginTop: '20px',
              padding: '12px 16px',
              background: 'var(--neutral-50)',
              borderRadius: 'var(--radius-md)',
              borderLeft: '4px solid var(--primary)',
              fontSize: '13px',
            }}
          >
            <strong>Observaciones Generales de Apertura:</strong>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
              {historia.observacionesGenerales}
            </p>
          </div>
        )}
      </Card>

      {/* Antecedentes Clínicos */}
      <Card
        title="1. Antecedentes Médicos y Odontológicos"
        action={
          onEditarAntecedentes ? (
            <Button
              variant="secondary"
              onClick={() => onEditarAntecedentes(historia.id)}
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              ✏️ Modificar Antecedentes
            </Button>
          ) : null
        }
      >
        <AntecedentesSection antecedentes={historia.antecedentes} />
      </Card>

      {/* Alergias Registradas */}
      <Card
        title={`2. Alergias y Reacciones Adversas (${historia.alergias?.length || 0})`}
      >
        <AlergiasTable alergias={historia.alergias} />
      </Card>

      {/* Medicamentos Actuales */}
      <Card
        title={`3. Medicamentos de Consumo Actual (${historia.medicamentosActuales?.length || 0})`}
      >
        <MedicamentosList medicamentos={historia.medicamentosActuales} />
      </Card>

      {/* Línea de Tiempo de Auditoría */}
      <Card
        title={`4. Historial de Auditoría Clínica (${historia.historialCambios?.length || 0} movimientos)`}
      >
        <AuditoriaTimeline historial={historia.historialCambios} />
      </Card>
    </div>
  );
}
