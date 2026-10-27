import { useState, useMemo } from 'react';
import { ArcadaDental } from './ArcadaDental.jsx';
import { SuperficiesDentales } from './SuperficiesDentales.jsx';
import { DetallePiezaDental } from './DetallePiezaDental.jsx';
import { EditorPiezaDental } from './EditorPiezaDental.jsx';
import { PanelCambiosPendientes } from './PanelCambiosPendientes.jsx';
import { ModalRegistrarRevision } from './ModalRegistrarRevision.jsx';
import { LeyendaClinica } from './LeyendaClinica.jsx';
import { useOdontogramaEditor } from '../../hooks/useOdontogramaEditor.js';
import { Spinner } from '../common/Spinner.jsx';
import { Alert } from '../common/Alert.jsx';
import { Button } from '../common/Button.jsx';
import '../../styles/odontograma.css';

/**
 * Visor interactivo clínico del Odontograma Longitudinal (Iteraciones 7F-2, 7F-3A y 7F-3B).
 *
 * Soporta dos modos explícitos:
 * 1. "Ver Odontograma": Solo lectura con navegación e inspección anatómica.
 * 2. "Preparar Edición": Editor en memoria de borradores locales no persistidos (INV-ODO-02 / INV-ODO-04).
 *
 * Integración 7F-3B:
 * - Modal controlado de registro de revisión con inspección de deltas y validación.
 * - Bloqueo explícito de escrituras en MongoDB Standalone.
 *
 * @param {object} props
 * @param {object|null} props.odontograma - OdontogramaActualDto proveniente de useOdontograma
 * @param {boolean} [props.loading=false] - Estado de carga asíncrona
 * @param {object|null} [props.error=null] - Error de solicitud (ProblemDetailsError)
 * @param {Function} [props.onRecargar] - Callback para reintentar o recargar
 * @param {string} [props.historiaClinicaId] - ID de la historia clínica en contexto
 * @param {Function} [props.onRegistrarRevision] - Callback para enviar revisión al backend
 * @param {boolean} [props.isSubmitting=false] - Solicitud de revisión en curso
 * @param {object|null} [props.errorRegistro=null] - Error devuelto al intentar registrar
 * @param {object|null} [props.conflictRegistro=null] - Detalle de conflicto 409
 * @param {boolean} [props.escrituraHabilitada=false] - Bloqueo de escritura en standalone
 * @param {Function} [props.onSimularEnvio] - Callback para pruebas de integración con mocks
 */
export function OdontogramaViewer({
  odontograma,
  loading = false,
  error = null,
  onRecargar,
  historiaClinicaId = '',
  onRegistrarRevision,
  isSubmitting = false,
  errorRegistro = null,
  conflictRegistro = null,
  escrituraHabilitada = false,
  onSimularEnvio,
}) {
  const [userSelectedFDI, setUserSelectedFDI] = useState(null);
  const [modalRevisionAbierto, setModalRevisionAbierto] = useState(false);

  // Hook gestor del borrador clínico en memoria (Iteración 7F-3A)
  const editor = useOdontogramaEditor(odontograma, historiaClinicaId);

  // Mapear el arreglo de piezas originales a un diccionario por numeroFDI para acceso O(1)
  const piezasMap = useMemo(() => {
    if (!odontograma?.piezas || !Array.isArray(odontograma.piezas)) {
      return {};
    }
    const map = {};
    for (const p of odontograma.piezas) {
      if (p && p.numeroFDI) {
        map[p.numeroFDI] = p;
      }
    }
    return map;
  }, [odontograma]);

  // Si estamos en modo edición, usamos el mapa de piezas proyectadas con los borradores aplicados
  const activePiezasMap = editor.modoEdicion ? editor.piezasProyectadasMap : piezasMap;

  // Derivar la pieza activa: si el usuario seleccionó una pieza válida, usarla; si no, la primera pieza disponible
  const selectedNumeroFDI = useMemo(() => {
    if (userSelectedFDI && activePiezasMap[userSelectedFDI]) {
      return userSelectedFDI;
    }
    if (odontograma?.piezas && odontograma.piezas.length > 0) {
      return odontograma.piezas[0]?.numeroFDI || 11;
    }
    return null;
  }, [userSelectedFDI, activePiezasMap, odontograma]);

  // Manejo de Estado: Cargando
  if (loading) {
    return (
      <div className="odontograma-container" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Spinner dark />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
          Recuperando estado consolidado del odontograma en MS2...
        </p>
      </div>
    );
  }

  // Manejo de Estado: Error 404 (Sin Odontograma previo)
  if (error && error.status === 404) {
    return (
      <div className="odontograma-container">
        <div className="empty-state" style={{ padding: '40px 20px' }}>
          <div className="empty-state-icon">🦷</div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>
            Expediente sin Odontograma Inicializado
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '520px', margin: '0 auto 16px', color: 'var(--text-secondary)' }}>
            La historia clínica <code>{historiaClinicaId}</code> no cuenta con un odontograma longitudinal registrado en el sistema.
          </p>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '480px', margin: '0 auto' }}>
            ℹ️ Por protocolo clínico, el odontograma se inicializa de forma explícita durante la apertura o atención de una consulta estomatológica. La preparación de revisiones está deshabilitada hasta su inicialización en el servidor.
          </div>
          {onRecargar && (
            <div style={{ marginTop: '20px' }}>
              <Button variant="secondary" onClick={onRecargar}>
                🔄 Reintentar Consulta
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Manejo de Estado: Error HTTP / Red
  if (error) {
    return (
      <div className="odontograma-container">
        <Alert
          title={error.title || 'Error al consultar el Odontograma'}
          detail={error.detail || 'Ocurrió un problema de comunicación con el servicio de odontogramas.'}
          status={error.status}
          invalidParams={error.invalidParams}
          onClose={onRecargar}
        />
        {onRecargar && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <Button variant="secondary" onClick={onRecargar}>
              🔄 Reintentar Carga
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Manejo de Estado: Sin datos
  if (!odontograma) {
    return (
      <div className="odontograma-container">
        <div className="empty-state" style={{ padding: '40px 20px' }}>
          <div className="empty-state-icon">📋</div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>
            Consulte un Odontograma Clínico
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '460px', margin: '0 auto', color: 'var(--text-secondary)' }}>
            Seleccione una historia clínica para examinar el mapa longitudinal de piezas dentales permanentes y temporales.
          </p>
        </div>
      </div>
    );
  }

  const piezaSeleccionada = selectedNumeroFDI ? activePiezasMap[selectedNumeroFDI] : null;

  return (
    <div className="odontograma-container" aria-label="Visor del Odontograma">
      {/* Encabezado clínico del odontograma */}
      <header className="odontograma-header">
        <div className="odontograma-header-info">
          <h2 className="odontograma-title">
            <span>🦷</span>
            <span>Odontograma Longitudinal Consolidado</span>
          </h2>
          <div className="odontograma-meta">
            <span className="odontograma-meta-item">
              Historia Clínica: <strong>{odontograma.historiaClinicaId}</strong>
            </span>
            <span className="odontograma-meta-item">
              Versión Maestra: <strong>v{odontograma.version || 1}</strong>
            </span>
            <span className="odontograma-meta-item">
              Revisiones Totales: <strong>{odontograma.totalRevisiones || 0}</strong>
            </span>
            {odontograma.actualizadoEn && (
              <span className="odontograma-meta-item">
                Última Actualización:{' '}
                <strong>{new Date(odontograma.actualizadoEn).toLocaleString()}</strong>
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Alternador de Modo: Ver Odontograma / Preparar Edición */}
          <div className="odontograma-modo-switcher" role="tablist" aria-label="Modo de trabajo clínico">
            <button
              type="button"
              role="tab"
              aria-selected={!editor.modoEdicion}
              className={`btn-modo ${!editor.modoEdicion ? 'active' : ''}`}
              onClick={editor.salirModoEdicion}
            >
              👁️ Ver odontograma
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editor.modoEdicion}
              className={`btn-modo ${editor.modoEdicion ? 'active' : ''}`}
              disabled={!editor.puedeEditar}
              title={
                !editor.puedeEditar
                  ? 'Requiere un odontograma inicializado en el servidor'
                  : 'Modo preparación de cambios clínicos (borrador en memoria)'
              }
              onClick={editor.iniciarEdicion}
            >
              ✏️ Preparar edición
              {editor.resumen.piezasModificadas > 0 && (
                <span
                  style={{
                    marginLeft: '6px',
                    backgroundColor: '#f59e0b',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '1px 6px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {editor.resumen.piezasModificadas}
                </span>
              )}
            </button>
          </div>

          {onRecargar && (
            <Button variant="secondary" onClick={onRecargar} style={{ fontSize: '12px', padding: '6px 12px' }}>
              🔄 Actualizar Datos
            </Button>
          )}
        </div>
      </header>

      {/* Panel de Cambios Pendientes (si estamos en modo edición y hay modificaciones) */}
      {editor.modoEdicion && editor.resumen.hayCambios && (
        <PanelCambiosPendientes
          resumen={editor.resumen}
          deltas={editor.deltas}
          onDescartarPieza={editor.descartarCambiosPieza}
          onDescartarTodo={editor.descartarTodo}
          onSalir={editor.salirModoEdicion}
          onAbrirRegistroRevision={() => setModalRevisionAbierto(true)}
        />
      )}

      {/* Distribución anatómica de las 52 posiciones FDI */}
      <ArcadaDental
        piezasMap={activePiezasMap}
        selectedNumeroFDI={selectedNumeroFDI}
        onSelectPieza={setUserSelectedFDI}
        fdisModificadosSet={editor.fdisModificadosSet}
      />

      {/* Panel inferior: Esquema de Superficies y Ficha de Detalle / Editor de la Pieza */}
      <div className="detalle-layout">
        {selectedNumeroFDI ? (
          <SuperficiesDentales
            numeroFDI={selectedNumeroFDI}
            superficies={piezaSeleccionada?.superficies || {}}
          />
        ) : (
          <div className="superficies-card" style={{ justifyContent: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Seleccione una pieza dental para ver sus 5 superficies.
            </span>
          </div>
        )}

        {editor.modoEdicion ? (
          <EditorPiezaDental
            numeroFDI={selectedNumeroFDI}
            piezaOriginal={piezasMap[selectedNumeroFDI]}
            piezaBorrador={editor.obtenerPiezaBorrador(selectedNumeroFDI)}
            tieneCambios={editor.fdisModificadosSet.has(selectedNumeroFDI)}
            onActualizar={(cambios) => editor.prepararCambioPieza(selectedNumeroFDI, cambios)}
            onDescartar={() => editor.descartarCambiosPieza(selectedNumeroFDI)}
          />
        ) : (
          <DetallePiezaDental
            numeroFDI={selectedNumeroFDI}
            pieza={piezaSeleccionada}
          />
        )}
      </div>

      {/* Leyenda clínica de apoyo visual */}
      <LeyendaClinica />

      {/* Modal para Registro Controlado de Revisiones (Iteración 7F-3B) */}
      {modalRevisionAbierto && (
        <ModalRegistrarRevision
          isOpen={modalRevisionAbierto}
          onClose={() => setModalRevisionAbierto(false)}
          odontograma={odontograma}
          deltas={editor.deltas}
          resumen={editor.resumen}
          onConfirmar={async (payload) => {
            if (onRegistrarRevision) {
              const res = await onRegistrarRevision(odontograma.id, payload);
              if (res) {
                editor.descartarTodo();
                editor.salirModoEdicion();
                setModalRevisionAbierto(false);
              }
              return res;
            }
          }}
          isSubmitting={isSubmitting}
          error={errorRegistro}
          conflict={conflictRegistro}
          onRecargarConsolidado={onRecargar}
          escrituraHabilitada={escrituraHabilitada}
          onSimularEnvio={
            onSimularEnvio
              ? async (payload) => {
                  const res = await onSimularEnvio(payload);
                  if (res) {
                    editor.descartarTodo();
                    editor.salirModoEdicion();
                    setModalRevisionAbierto(false);
                  }
                  return res;
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
