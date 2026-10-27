import { useState, useMemo } from 'react';
import { ArcadaDental } from './ArcadaDental.jsx';
import { SuperficiesDentales } from './SuperficiesDentales.jsx';
import { DetallePiezaDental } from './DetallePiezaDental.jsx';
import { LeyendaClinica } from './LeyendaClinica.jsx';
import { Badge } from '../common/Badge.jsx';
import { Button } from '../common/Button.jsx';
import {
  TIPO_REVISION_ODONTOGRAMA,
  ETIQUETAS_ESTADO_ANATOMICO,
  ETIQUETAS_SUPERFICIE,
  ETIQUETAS_CONDICION_SUPERFICIE,
  ETIQUETAS_TRATAMIENTO_ESTRUCTURAL,
} from '../../constants/odontograma.constants.js';

/**
 * Visor inmutable de Snapshots Históricos del Odontograma (Iteración 7F-4A).
 *
 * Principios clínicos:
 * - Estrictamente de SOLO LECTURA (sin botón ni modo de preparación de borradores).
 * - Muestra el estado exacto sellado de las 52 posiciones FDI en ese instante temporal.
 * - Preserva valores basales DESCONOCIDO y NO_EVALUADO sin inventar diagnósticos.
 * - Distingue con precisión cronológica fechaObservacionClinica vs fechaRegistro.
 * - Desglose de cambios atómicos aplicados (deltas) que originaron la revisión.
 *
 * @param {object} props
 * @param {object} props.revision - RevisionOdontogramaDto con snapshotPiezas y metadatos
 * @param {Function} [props.onIniciarEnmienda] - Callback para preparar enmienda sobre esta revisión
 */
export function SnapshotHistoricoViewer({ revision, onVolver, onIniciarEnmienda }) {
  const [userSelectedFDI, setUserSelectedFDI] = useState(null);
  const [mostrarDeltasDetalle, setMostrarDeltasDetalle] = useState(false);

  // Mapear snapshotPiezas a un diccionario indexado por numeroFDI para acceso O(1)
  const piezasMap = useMemo(() => {
    if (!revision?.snapshotPiezas || !Array.isArray(revision.snapshotPiezas)) {
      return {};
    }
    const map = {};
    for (const p of revision.snapshotPiezas) {
      if (p && p.numeroFDI) {
        map[p.numeroFDI] = p;
      }
    }
    return map;
  }, [revision]);

  // Posición FDI seleccionada (por defecto la primera del snapshot o 11)
  const selectedNumeroFDI = useMemo(() => {
    if (userSelectedFDI && piezasMap[userSelectedFDI]) {
      return userSelectedFDI;
    }
    if (revision?.snapshotPiezas && revision.snapshotPiezas.length > 0) {
      return revision.snapshotPiezas[0]?.numeroFDI || 11;
    }
    return null;
  }, [userSelectedFDI, piezasMap, revision]);

  const piezaSeleccionada = selectedNumeroFDI ? piezasMap[selectedNumeroFDI] : null;

  if (!revision) {
    return (
      <div className="odontograma-container">
        <div className="empty-state">
          <p>No se ha especificado un snapshot histórico para visualizar.</p>
          <Button variant="secondary" onClick={onVolver}>
            ← Volver
          </Button>
        </div>
      </div>
    );
  }

  const esEnmienda = revision.tipoRevision === TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA;
  const deltas = Array.isArray(revision.cambiosAplicados) ? revision.cambiosAplicados : [];

  return (
    <div className="snapshot-historico-viewer" aria-label={`Snapshot histórico revisión ${revision.numeroRevision}`}>
      {/* Banner Informativo de Registro Histórico Inmutable */}
      <div className="snapshot-banner-inmutable" role="region" aria-label="Aviso de snapshot histórico sellado">
        <div className="snapshot-banner-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '24px' }}>🏛️</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '17px', color: '#1e3a8a' }}>
                  Snapshot Histórico Inmutable — Revisión #{revision.numeroRevision}
                </h3>
                <Badge variant={esEnmienda ? 'warning' : 'primary'}>
                  {esEnmienda ? 'Enmienda Correctiva' : 'Nueva Observación'}
                </Badge>
                {revision.aplicaAlEstadoActual ? (
                  <Badge variant="success">Proyectada en estado actual</Badge>
                ) : (
                  <Badge variant="secondary">Retrospectiva sellada</Badge>
                )}
              </div>
              <span style={{ fontSize: '12px', color: '#1e40af', display: 'block', marginTop: '2px' }}>
                🔒 <strong>Solo Lectura:</strong> Este visor refleja el estado anatómico consolidado en el momento exacto
                del sellado. La edición de piezas está deshabilitada.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onIniciarEnmienda && (
              <Button
                variant="warning"
                onClick={() => onIniciarEnmienda(revision)}
                style={{ fontSize: '13px', padding: '6px 14px', fontWeight: 600, background: '#d97706', color: '#fff', border: 'none' }}
                title={`Iniciar preparación de enmienda correctiva sobre la revisión #${revision.numeroRevision}`}
              >
                ✏️ Preparar Enmienda de esta Revisión
              </Button>
            )}

            <Button
              variant="secondary"
              onClick={onVolver}
              style={{ fontSize: '13px', padding: '6px 14px', fontWeight: 600 }}
            >
              ← Volver al Odontograma Actual
            </Button>
          </div>
        </div>

        {/* Ficha de metadatos clínicos de la revisión */}
        <div className="snapshot-meta-grid">
          <div className="snapshot-meta-cell">
            <span className="snapshot-meta-label">Fecha Observación Clínica:</span>
            <strong className="snapshot-meta-val">
              {revision.fechaObservacionClinica
                ? new Date(revision.fechaObservacionClinica).toLocaleString()
                : 'No registrada'}
            </strong>
          </div>

          <div className="snapshot-meta-cell">
            <span className="snapshot-meta-label">Fecha Registro en Servidor:</span>
            <strong className="snapshot-meta-val">
              {revision.fechaRegistro
                ? new Date(revision.fechaRegistro).toLocaleString()
                : 'No registrada'}
            </strong>
          </div>

          <div className="snapshot-meta-cell">
            <span className="snapshot-meta-label">Profesional Responsable:</span>
            <strong className="snapshot-meta-val">
              {revision.registradoPor || 'No especificado'}
            </strong>
          </div>

          <div className="snapshot-meta-cell">
            <span className="snapshot-meta-label">Consulta Odontológica:</span>
            <strong className="snapshot-meta-val">
              {revision.consultaId ? <code>{revision.consultaId}</code> : 'Sin consulta asociada'}
            </strong>
          </div>

          {esEnmienda && revision.revisionCorregidaId && (
            <div className="snapshot-meta-cell" style={{ gridColumn: '1 / -1', background: '#fef3c7', borderRadius: '4px', padding: '6px 8px' }}>
              <span className="snapshot-meta-label" style={{ color: '#92400e' }}>Revisión Previa Rectificada:</span>
              <strong style={{ color: '#b45309', marginLeft: '6px' }}>
                <code>{revision.revisionCorregidaId}</code>
              </strong>
            </div>
          )}

          <div className="snapshot-meta-cell" style={{ gridColumn: '1 / -1' }}>
            <span className="snapshot-meta-label">Motivo Clínico del Registro:</span>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: 'var(--text-primary)' }}>
              {revision.motivoRevision || 'Sin justificación registrada'}
            </p>
          </div>
        </div>

        {/* Acordeón opcional de cambios atómicos (deltas) aplicados en esta revisión */}
        {deltas.length > 0 && (
          <div className="snapshot-deltas-toggle-container">
            <button
              type="button"
              className="btn-toggle-json"
              onClick={() => setMostrarDeltasDetalle(!mostrarDeltasDetalle)}
            >
              {mostrarDeltasDetalle
                ? '▲ Ocultar desglose de deltas aplicados'
                : `▼ Ver desglose de ${deltas.length} cambios aplicados en esta revisión`}
            </button>

            {mostrarDeltasDetalle && (
              <ul className="snapshot-deltas-lista">
                {deltas.map((d) => (
                  <li key={d.numeroFDI} className="snapshot-delta-item">
                    <strong>Pieza FDI {d.numeroFDI}:</strong>{' '}
                    {d.estadoAnatomicoNuevo && (
                      <span>
                        Anatomía: {ETIQUETAS_ESTADO_ANATOMICO[d.estadoAnatomicoAnterior] || d.estadoAnatomicoAnterior} →{' '}
                        <strong>{ETIQUETAS_ESTADO_ANATOMICO[d.estadoAnatomicoNuevo] || d.estadoAnatomicoNuevo}</strong>;{' '}
                      </span>
                    )}
                    {d.superficiesModificadas?.map((s) => (
                      <span key={s.superficie}>
                        {ETIQUETAS_SUPERFICIE[s.superficie] || s.superficie}:{' '}
                        {ETIQUETAS_CONDICION_SUPERFICIE[s.condicionAnterior] || s.condicionAnterior} →{' '}
                        <strong>{ETIQUETAS_CONDICION_SUPERFICIE[s.condicionNueva] || s.condicionNueva}</strong>;{' '}
                      </span>
                    ))}
                    {d.tratamientoEstructuralAgregado && (
                      <span>
                        Tratamiento: {ETIQUETAS_TRATAMIENTO_ESTRUCTURAL[d.tratamientoEstructuralAgregado] || d.tratamientoEstructuralAgregado};{' '}
                      </span>
                    )}
                    {d.observaciones && <em>«{d.observaciones}»</em>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Distribución anatómica de las 52 posiciones FDI del snapshot sellado */}
      <ArcadaDental
        piezasMap={piezasMap}
        selectedNumeroFDI={selectedNumeroFDI}
        onSelectPieza={setUserSelectedFDI}
        fdisModificadosSet={new Set(deltas.map((d) => d.numeroFDI))}
      />

      {/* Esquema de Superficies y Ficha de Detalle de la pieza seleccionada (estricto solo lectura) */}
      <div className="detalle-layout">
        {selectedNumeroFDI ? (
          <SuperficiesDentales
            numeroFDI={selectedNumeroFDI}
            superficies={piezaSeleccionada?.superficies || {}}
          />
        ) : (
          <div className="superficies-card" style={{ justifyContent: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Seleccione una pieza dental para ver sus 5 superficies en este snapshot histórico.
            </span>
          </div>
        )}

        <DetallePiezaDental
          numeroFDI={selectedNumeroFDI}
          pieza={piezaSeleccionada}
        />
      </div>

      {/* Leyenda clínica estandarizada */}
      <LeyendaClinica />
    </div>
  );
}
