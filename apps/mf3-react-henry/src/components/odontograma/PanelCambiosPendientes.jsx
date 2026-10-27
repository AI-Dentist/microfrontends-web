import { useState } from 'react';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import {
  ETIQUETAS_ESTADO_ANATOMICO,
  ETIQUETAS_SUPERFICIE,
  ETIQUETAS_CONDICION_SUPERFICIE,
  ETIQUETAS_TRATAMIENTO_ESTRUCTURAL,
} from '../../constants/odontograma.constants.js';

/**
 * Panel informativo y de control para los cambios preparados en el borrador clínico.
 *
 * @param {object} props
 * @param {object} props.resumen - Resumen calculado por resumirCambiosBorrador
 * @param {Array<object>} props.deltas - Lista de deltas calculados
 * @param {Function} props.onDescartarTodo - Callback para descartar todos los cambios
 * @param {Function} props.onDescartarPieza - Callback (numeroFDI) => void
 * @param {Function} props.onSalir - Callback para volver a modo lectura
 */
export function PanelCambiosPendientes({
  resumen,
  deltas = [],
  onDescartarTodo,
  onDescartarPieza,
  onSalir,
  onCerrarEdicion,
  onAbrirRegistroRevision,
}) {
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const handleSalir = onSalir || onCerrarEdicion;

  const {
    hayCambios,
    totalPiezasModificadas,
    totalSuperficiesModificadas,
    totalCambiosAnatomicos,
    totalTratamientosAgregados,
  } = resumen;

  const handleConfirmarDescarte = () => {
    onDescartarTodo();
    setConfirmandoDescarte(false);
  };

  return (
    <aside className="panel-cambios-pendientes" aria-label="Panel de borrador clínico">
      <div className="panel-cambios-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📝</span>
          <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
            Borrador Clínico sin Guardar
          </h4>
          <Badge variant={hayCambios ? 'warning' : 'secondary'}>
            {hayCambios ? `${totalPiezasModificadas} piezas modificadas` : 'Sin modificaciones'}
          </Badge>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {hayCambios && !confirmandoDescarte && (
            <Button
              variant="secondary"
              onClick={() => setConfirmandoDescarte(true)}
              style={{ fontSize: '12px', padding: '4px 10px', color: 'var(--danger)' }}
            >
              🗑️ Descartar Todo
            </Button>
          )}

          {confirmandoDescarte && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: 'var(--danger-bg)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 600 }}>¿Descartar borrador?</span>
              <Button
                variant="danger"
                onClick={handleConfirmarDescarte}
                style={{ fontSize: '11px', padding: '2px 8px' }}
              >
                Sí, descartar
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmandoDescarte(false)}
                style={{ fontSize: '11px', padding: '2px 8px' }}
              >
                Cancelar
              </Button>
            </div>
          )}

          {hayCambios && onAbrirRegistroRevision && (
            <Button
              variant="primary"
              onClick={onAbrirRegistroRevision}
              style={{ fontSize: '12px', padding: '4px 12px', fontWeight: 600 }}
              title="Abrir formulario para registrar la revisión en el expediente"
            >
              💾 Registrar Revisión...
            </Button>
          )}

          {handleSalir && (
            <Button
              variant="secondary"
              onClick={handleSalir}
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              👁️ Volver a Lectura
            </Button>
          )}
        </div>
      </div>

      {/* Métricas del borrador */}
      <div className="panel-cambios-metricas">
        <div className="metrica-item">
          <span className="metrica-valor">{totalPiezasModificadas}</span>
          <span className="metrica-etiqueta">Piezas</span>
        </div>
        <div className="metrica-item">
          <span className="metrica-valor">{totalSuperficiesModificadas}</span>
          <span className="metrica-etiqueta">Superficies</span>
        </div>
        <div className="metrica-item">
          <span className="metrica-valor">{totalCambiosAnatomicos}</span>
          <span className="metrica-etiqueta">Estados Anatómicos</span>
        </div>
        <div className="metrica-item">
          <span className="metrica-valor">{totalTratamientosAgregados}</span>
          <span className="metrica-etiqueta">Tratamientos</span>
        </div>
      </div>

      {/* Lista detallada de deltas */}
      {hayCambios ? (
        <div className="panel-deltas-lista">
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
            Desglose de Deltas Preparados:
          </span>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {deltas.map((delta) => (
              <li key={delta.numeroFDI} className="delta-item-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    Pieza FDI {delta.numeroFDI}
                  </strong>
                  <button
                    type="button"
                    onClick={() => onDescartarPieza(delta.numeroFDI)}
                    className="delta-descartar-btn"
                    title="Descartar cambios de esta pieza"
                  >
                    ✕ Revertir
                  </button>
                </div>

                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '3px', color: 'var(--text-secondary)' }}>
                  {delta.estadoAnatomicoNuevo && (
                    <div>
                      Anatomía:{' '}
                      <span className="delta-diff">
                        {ETIQUETAS_ESTADO_ANATOMICO[delta.estadoAnatomicoAnterior] || delta.estadoAnatomicoAnterior} →{' '}
                        <strong>{ETIQUETAS_ESTADO_ANATOMICO[delta.estadoAnatomicoNuevo] || delta.estadoAnatomicoNuevo}</strong>
                      </span>
                    </div>
                  )}

                  {delta.superficiesModificadas?.map((sup) => (
                    <div key={sup.superficie}>
                      {ETIQUETAS_SUPERFICIE[sup.superficie] || sup.superficie}:{' '}
                      <span className="delta-diff">
                        {ETIQUETAS_CONDICION_SUPERFICIE[sup.condicionAnterior] || sup.condicionAnterior} →{' '}
                        <strong>{ETIQUETAS_CONDICION_SUPERFICIE[sup.condicionNueva] || sup.condicionNueva}</strong>
                      </span>
                    </div>
                  ))}

                  {delta.tratamientoEstructuralAgregado && (
                    <div>
                      Tratamiento agregado:{' '}
                      <strong>{ETIQUETAS_TRATAMIENTO_ESTRUCTURAL[delta.tratamientoEstructuralAgregado] || delta.tratamientoEstructuralAgregado}</strong>
                    </div>
                  )}

                  {delta.observaciones && (
                    <div style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                      «{delta.observaciones}»
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
          Seleccione una pieza dental y modifique sus condiciones para preparar un borrador de revisión.
        </div>
      )}

      {/* Aviso de seguridad clínica */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '8px', lineHeight: 1.3 }}>
        ℹ️ <strong>Borrador local:</strong> Estos cambios residen únicamente en la memoria de la sesión. No se han enviado al servidor ni se han registrado transacciones en MongoDB.
      </div>
    </aside>
  );
}
