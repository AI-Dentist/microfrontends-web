import { Card } from '../common/Card.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import { EstadoConsultaBadge } from './EstadoConsultaBadge.jsx';
import { SnapshotRiesgoClinicoCard } from './SnapshotRiesgoClinicoCard.jsx';

/**
 * Vista completa de una Consulta Odontológica organizada por secciones clínicas.
 *
 * @param {object} props
 * @param {object} props.consulta - ConsultaOdontologicaResponseDto
 * @param {Function} [props.onVolver] - Callback para regresar al listado
 * @param {Function} [props.onVerHistoria] - Callback para navegar al expediente
 */
export function ConsultaDetailView({
  consulta,
  onVolver,
  onVerHistoria,
  onEditarAtencion,
  onCompletarClick,
  onCancelarClick,
}) {
  if (!consulta) return null;

  const {
    id,
    historiaClinicaId,
    pacienteId,
    odontologoId,
    citaId,
    versionHistoriaReferenciada,
    snapshotRiesgoClinico,
    fechaAtencion,
    cerradaEn,
    estado,
    motivoConsulta,
    anamnesisActual,
    exploracionFisica,
    diagnosticos = [],
    procedimientosRealizados = [],
    evolucionSOAP,
    recomendaciones,
    motivoCancelacion,
    version,
    creadoEn,
    actualizadoEn,
    creadoPor,
    actualizadoPor,
  } = consulta;

  const esTerminal = estado === 'COMPLETADA' || estado === 'CANCELADA';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Barra de acciones superior */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {onVolver && (
            <Button variant="secondary" onClick={onVolver} style={{ fontSize: '13px', padding: '6px 14px' }}>
              ← Volver al Listado
            </Button>
          )}
          {onVerHistoria && historiaClinicaId && (
            <Button
              variant="secondary"
              onClick={() => onVerHistoria(historiaClinicaId)}
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              📋 Ver Historia Clínica ({historiaClinicaId})
            </Button>
          )}
        </div>

        {/* Acciones clínicas disponibles solo para consultas EN_CURSO */}
        {!esTerminal && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {onEditarAtencion && (
              <Button
                variant="primary"
                onClick={() => onEditarAtencion(id)}
                style={{ fontSize: '13px', padding: '6px 14px' }}
              >
                ✏️ Atender en Sillón (6F-2)
              </Button>
            )}

            {onCompletarClick && (
              <Button
                variant="primary"
                onClick={() => onCompletarClick(consulta)}
                style={{
                  fontSize: '13px',
                  padding: '6px 14px',
                  background: 'var(--success)',
                  borderColor: 'var(--success-border)',
                }}
              >
                ✓ Completar Consulta (6F-3)
              </Button>
            )}

            {onCancelarClick && (
              <Button
                variant="secondary"
                onClick={() => onCancelarClick(consulta)}
                style={{
                  fontSize: '13px',
                  padding: '6px 14px',
                  color: 'var(--danger)',
                  borderColor: 'var(--danger-border)',
                }}
              >
                🚫 Cancelar Consulta
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 1. Encabezado / Identificación */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '26px' }}>🦷</span>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
                Consulta: <code style={{ fontSize: '18px' }}>{id}</code>
              </h2>
              <EstadoConsultaBadge estado={estado} />
              <Badge variant="neutral">Versión {version}</Badge>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '12px 24px',
                marginTop: '16px',
                fontSize: '14px',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Historia Clínica:</span>
                <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                  {historiaClinicaId} (v{versionHistoriaReferenciada})
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Identificador del Paciente:</span>
                <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                  {pacienteId}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Odontólogo Responsable:</span>
                <div style={{ fontWeight: 600 }}>{odontologoId}</div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Fecha de Atención:</span>
                <div style={{ fontWeight: 600 }}>
                  {fechaAtencion ? new Date(fechaAtencion).toLocaleString() : '—'}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Cita Programada MS3:</span>
                <div>
                  {citaId ? (
                    <code style={{ background: 'var(--neutral-100)', padding: '2px 6px' }}>{citaId}</code>
                  ) : (
                    <span style={{ color: 'var(--warning)', fontWeight: 600 }}>⚡ Urgencia / Sin cita</span>
                  )}
                </div>
              </div>

              {cerradaEn && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Cierre Formal:</span>
                  <div style={{ color: 'var(--success)', fontWeight: 600 }}>
                    {new Date(cerradaEn).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Banner de Estado Terminal: COMPLETADA */}
        {estado === 'COMPLETADA' && (
          <div
            style={{
              marginTop: '16px',
              padding: '14px 18px',
              background: 'var(--success-bg)',
              border: '1px solid var(--success-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--success)',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
              <span>🔒</span> Consulta Odontológica Completada y Sellada Formalmente
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Este encuentro clínico ha sido cerrado formalmente el <strong>{cerradaEn ? new Date(cerradaEn).toLocaleString() : '—'}</strong> por el profesional <code>{actualizadoPor || odontologoId}</code>.
              Por normativa de trazabilidad e inmutabilidad clínica, los datos están sellados y no admiten modificaciones ni cancelaciones posteriores.
            </p>
          </div>
        )}

        {/* Banner de Estado Terminal: CANCELADA */}
        {estado === 'CANCELADA' && (
          <div
            style={{
              marginTop: '16px',
              padding: '14px 18px',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--danger)',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
              <span>🚫</span> Consulta Odontológica Cancelada Definitivamente
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Cancelada el <strong>{cerradaEn ? new Date(cerradaEn).toLocaleString() : (actualizadoEn ? new Date(actualizadoEn).toLocaleString() : '—')}</strong> por el operador <code>{actualizadoPor || odontologoId}</code>.
              {motivoCancelacion && (
                <>
                  <br />
                  <strong>Motivo registrado: </strong>
                  <span>{motivoCancelacion}</span>
                </>
              )}
            </p>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              El registro se conserva íntegro en la base de datos para auditoría clínica legal y no admite reapertura.
            </div>
          </div>
        )}
      </Card>

      {/* 2. Snapshot de Riesgo Clínico Inmutable */}
      <SnapshotRiesgoClinicoCard snapshot={snapshotRiesgoClinico} />

      {/* 3. Motivo y Anamnesis Actual */}
      <Card title="1. Motivo de Consulta y Anamnesis del Episodio">
        <div style={{ marginBottom: '16px' }}>
          <strong style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Motivo Manifestado por el Paciente:</strong>
          <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {motivoConsulta || '—'}
          </p>
        </div>

        {anamnesisActual ? (
          <div
            style={{
              background: 'var(--neutral-50)',
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
              Detalle de la Anamnesis:
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '14px', lineHeight: 1.5 }}>
              {anamnesisActual.descripcion || 'Sin descripción detallada registrada.'}
            </p>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Tiempo de evolución: </span>
                <strong>{anamnesisActual.tiempoEvolucion || 'No especificado'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Escala de Dolor (EVA 0-10): </span>
                {anamnesisActual.escalaDolorEVA !== null && anamnesisActual.escalaDolorEVA !== undefined ? (
                  <Badge
                    variant={
                      anamnesisActual.escalaDolorEVA >= 7
                        ? 'danger'
                        : anamnesisActual.escalaDolorEVA >= 4
                          ? 'warning'
                          : 'success'
                    }
                  >
                    EVA {anamnesisActual.escalaDolorEVA} / 10
                  </Badge>
                ) : (
                  <span>No evaluado</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
            Anamnesis del episodio no registrada en esta consulta.
          </p>
        )}
      </Card>

      {/* 4. Exploración Física */}
      <Card title="2. Exploración Física y Examen Clínico">
        {exploracionFisica ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <div
              style={{
                padding: '12px',
                background: 'var(--neutral-50)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                🔍 Inspección Intraoral (Requerido para cierre)
              </div>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
                {exploracionFisica.inspeccionIntraoral || (
                  <span style={{ color: 'var(--text-muted)' }}>No documentada todavía</span>
                )}
              </p>
            </div>

            <div
              style={{
                padding: '12px',
                background: 'var(--neutral-50)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                👤 Inspección Extraoral
              </div>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
                {exploracionFisica.inspeccionExtraoral || (
                  <span style={{ color: 'var(--text-muted)' }}>No evaluada / Sin hallazgos registrados</span>
                )}
              </p>
            </div>

            <div
              style={{
                padding: '12px',
                background: 'var(--neutral-50)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                🦷 Hallazgos Dentales / Oclusión
              </div>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
                {exploracionFisica.hallazgosDentales || (
                  <span style={{ color: 'var(--text-muted)' }}>No documentados</span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
            Exploración física pendiente de registro en sillón dental.
          </p>
        )}
      </Card>

      {/* 5. Diagnósticos */}
      <Card title={`3. Diagnósticos Clínicos (${diagnosticos.length})`}>
        {diagnosticos.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
            No se han registrado diagnósticos clínicos en esta consulta.
          </p>
        ) : (
          <div className="table-responsive">
            <table className="clinical-table">
              <thead>
                <tr>
                  <th>Código CIE-10</th>
                  <th>Descripción Clínica</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {diagnosticos.map((diag, idx) => (
                  <tr key={idx}>
                    <td>
                      {diag.codigoCIE10 ? (
                        <code style={{ fontWeight: 700 }}>{diag.codigoCIE10}</code>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{diag.descripcion}</td>
                    <td>
                      <Badge variant={diag.tipo === 'DEFINITIVO' ? 'success' : 'primary'}>
                        {diag.tipo || 'PRESUNTIVO'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 6. Procedimientos Realizados */}
      <Card title={`4. Procedimientos Realizados en Sillón (${procedimientosRealizados.length})`}>
        {procedimientosRealizados.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
            No se han registrado procedimientos en esta atención.
          </p>
        ) : (
          <div className="table-responsive">
            <table className="clinical-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Procedimiento</th>
                  <th>Pieza Dental (FDI)</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {procedimientosRealizados.map((proc, idx) => (
                  <tr key={idx}>
                    <td>
                      {proc.codigo ? <code>{proc.codigo}</code> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontWeight: 600 }}>{proc.descripcion}</td>
                    <td>
                      {proc.piezaDental ? (
                        <Badge variant="primary" style={{ fontWeight: 700 }}>
                          Pieza {proc.piezaDental}
                        </Badge>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>General / Sin pieza</span>
                      )}
                    </td>
                    <td style={{ fontSize: '13px' }}>{proc.observaciones || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 7. Evolución SOAP y Recomendaciones */}
      <Card title="5. Evolución Clínica (SOAP) y Recomendaciones">
        {evolucionSOAP ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '10px 14px', background: 'var(--neutral-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--primary-dark)', marginBottom: '4px' }}>
                [S] SUBJETIVO
              </div>
              <p style={{ margin: 0, fontSize: '13px' }}>{evolucionSOAP.subjetivo || '—'}</p>
            </div>

            <div style={{ padding: '10px 14px', background: 'var(--neutral-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--primary-dark)', marginBottom: '4px' }}>
                [O] OBJETIVO
              </div>
              <p style={{ margin: 0, fontSize: '13px' }}>{evolucionSOAP.objetivo || '—'}</p>
            </div>

            <div style={{ padding: '10px 14px', background: 'var(--neutral-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--primary-dark)', marginBottom: '4px' }}>
                [A] ANÁLISIS
              </div>
              <p style={{ margin: 0, fontSize: '13px' }}>{evolucionSOAP.analisis || '—'}</p>
            </div>

            <div style={{ padding: '10px 14px', background: 'var(--neutral-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--primary-dark)', marginBottom: '4px' }}>
                [P] PLAN DE TRATAMIENTO
              </div>
              <p style={{ margin: 0, fontSize: '13px' }}>{evolucionSOAP.plan || '—'}</p>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 14px' }}>
            Notas de evolución SOAP no registradas.
          </p>
        )}

        <div>
          <strong style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Recomendaciones e Indicaciones al Paciente:</strong>
          <p style={{ margin: '4px 0 0', fontSize: '14px', fontStyle: recomendaciones ? 'normal' : 'italic', color: recomendaciones ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {recomendaciones || 'Sin indicaciones terapéuticas adicionales registradas.'}
          </p>
        </div>
      </Card>

      {/* 8. Auditoría y Trazabilidad */}
      <Card title="6. Auditoría y Trazabilidad del Encuentro">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '13px' }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Creado en: </span>
            <strong>{creadoEn ? new Date(creadoEn).toLocaleString() : '—'}</strong>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)' }}>Creado por (Operador): </span>
            <code>{creadoPor || odontologoId || '—'}</code>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)' }}>Última actualización: </span>
            <strong>{actualizadoEn ? new Date(actualizadoEn).toLocaleString() : '—'}</strong>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)' }}>Actualizado por: </span>
            <code>{actualizadoPor || '—'}</code>
          </div>

          {cerradaEn && (
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Fecha de Cierre / Cancelación: </span>
              <strong style={{ color: estado === 'CANCELADA' ? 'var(--danger)' : 'var(--success)' }}>
                {new Date(cerradaEn).toLocaleString()}
              </strong>
            </div>
          )}

          <div>
            <span style={{ color: 'var(--text-muted)' }}>Versión del Registro: </span>
            <Badge variant="neutral">v{version}</Badge>
          </div>
        </div>

        {motivoCancelacion && (
          <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', fontSize: '13px' }}>
            <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Motivo de Cancelación Registrado: </span>
            <span style={{ color: 'var(--text-primary)' }}>{motivoCancelacion}</span>
          </div>
        )}
      </Card>
    </div>
  );
}
