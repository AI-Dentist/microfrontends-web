import { useState, useMemo } from 'react';
import { ArcadaDental } from './ArcadaDental.jsx';
import { SuperficiesDentales } from './SuperficiesDentales.jsx';
import { DetallePiezaDental } from './DetallePiezaDental.jsx';
import { EditorPiezaDental } from './EditorPiezaDental.jsx';
import { PanelCambiosPendientes } from './PanelCambiosPendientes.jsx';
import { ModalRegistrarRevision } from './ModalRegistrarRevision.jsx';
import { ModalRegistrarEnmienda } from './ModalRegistrarEnmienda.jsx';
import { HistorialOdontograma } from './HistorialOdontograma.jsx';
import { SnapshotHistoricoViewer } from './SnapshotHistoricoViewer.jsx';
import { LeyendaClinica } from './LeyendaClinica.jsx';
import { useOdontogramaEditor } from '../../hooks/useOdontogramaEditor.js';
import { useOdontogramaEnmienda } from '../../hooks/useOdontogramaEnmienda.js';
import { Spinner } from '../common/Spinner.jsx';
import { Alert } from '../common/Alert.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import '../../styles/odontograma.css';

/**
 * Visor interactivo clínico del Odontograma Longitudinal (Iteraciones 7F-2, 7F-3A, 7F-3B y 7F-4A).
 *
 * Modos de trabajo:
 * 1. "Estado Actual Consolidado": Visor de las 52 posiciones FDI vigentes y preparación de borradores.
 * 2. "Historial del Odontograma": Listado paginado auditado de todas las revisiones y enmiendas.
 * 3. "Snapshot Histórico": Inspección inmutable de una revisión temporal sellada (solo lectura).
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
 * @param {object} [props.historial] - Objeto { total, limite, offset, revisiones }
 * @param {boolean} [props.loadingHistorial=false] - Carga de historial
 * @param {Function} [props.onCargarHistorial] - (offset, limite) => Promise<any>
 * @param {object|null} [props.snapshotSeleccionado=null] - RevisionOdontogramaDto histórico
 * @param {boolean} [props.loadingSnapshot=false] - Carga de snapshot
 * @param {Function} [props.onSeleccionarRevision] - (revision) => void
 * @param {Function} [props.onVolverDeSnapshot] - () => void
 * @param {string} [props.consultaIdContexto=''] - Consulta clínica activa
 * @param {Array<object>} [props.revisionesConsulta=[]] - Revisiones de la consulta
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
  historial = { total: 0, limite: 20, offset: 0, revisiones: [] },
  loadingHistorial = false,
  onCargarHistorial,
  snapshotSeleccionado = null,
  loadingSnapshot = false,
  onSeleccionarRevision,
  onVolverDeSnapshot,
  onCargarSnapshotRevision,
  consultaIdContexto = '',
  revisionesConsulta = [],
}) {
  const [userSelectedFDI, setUserSelectedFDI] = useState(null);
  const [modalRevisionAbierto, setModalRevisionAbierto] = useState(false);
  const [modalEnmiendaAbierto, setModalEnmiendaAbierto] = useState(false);
  const [vistaActiva, setVistaActiva] = useState('ACTUAL'); // 'ACTUAL' | 'HISTORIAL'

  // Hook gestor del borrador clínico en memoria para NUEVA_OBSERVACION (Iteración 7F-3A)
  const editor = useOdontogramaEditor(odontograma, historiaClinicaId);

  // Hook gestor del borrador independiente para ENMIENDA_CORRECTIVA (Iteración 7F-4B)
  const enmienda = useOdontogramaEnmienda(odontograma, historiaClinicaId);

  const handleIniciarEnmienda = async (revision) => {
    if (!revision) return;
    if (editor.modoEdicion && editor.resumen.hayCambios) {
      const confirmar = window.confirm(
        'Tiene un borrador activo de nueva observación con cambios no guardados. ¿Desea descartarlo para iniciar la enmienda correctiva?'
      );
      if (!confirmar) return;
      editor.descartarTodo();
      editor.salirModoEdicion();
    }
    // Si la revisión seleccionada no contiene 52 piezas y se dispone de cargador:
    if ((!revision.snapshotPiezas || revision.snapshotPiezas.length !== 52) && onCargarSnapshotRevision && odontograma?.id) {
      const cargada = await onCargarSnapshotRevision(odontograma.id, revision.id);
      if (cargada && Array.isArray(cargada.snapshotPiezas) && cargada.snapshotPiezas.length === 52) {
        enmienda.iniciarEnmienda(cargada);
        return;
      }
    }
    enmienda.iniciarEnmienda(revision);
  };

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

  // Si estamos en modo de preparación de ENMIENDA_CORRECTIVA histórica (Iteración 7F-4B)
  if (enmienda.modoEnmienda) {
    const revCorregida = enmienda.revisionCorregida;
    const fdiActivo = selectedNumeroFDI || (revCorregida?.snapshotPiezas?.[0]?.numeroFDI || 11);
    const piezaOriginalHistorica = enmienda.piezasHistoricasMap[fdiActivo];
    const piezaBorradorHistorica = enmienda.obtenerPiezaBorrador(fdiActivo);

    return (
      <div className="odontograma-container" aria-label="Editor de Enmienda Correctiva Histórica">
        <header className="enmienda-banner-header" role="region" aria-label="Aviso de enmienda en borrador">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '28px' }}>✏️</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', color: '#78350f' }}>
                    Edición de Enmienda Histórica — Borrador sin guardar
                  </h3>
                  <Badge variant="warning">ENMIENDA_CORRECTIVA</Badge>
                  <Badge variant="secondary">Corrige Rev #{revCorregida?.numeroRevision}</Badge>
                  <Badge variant="primary">v{enmienda.versionEsperadaOriginal || odontograma?.version || 1} esperada</Badge>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#92400e' }}>
                  Base de deltas: Snapshot histórico de la revisión {revCorregida?.id}. Invariante: <code>aplicaAlEstadoActual = false</code> (retrospectiva pura).
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {enmienda.resumen.hayCambios && (
                <Button
                  variant="primary"
                  onClick={() => setModalEnmiendaAbierto(true)}
                  style={{ fontSize: '13px', padding: '6px 14px', fontWeight: 600, background: '#d97706', borderColor: '#b45309' }}
                >
                  💾 Revisar y Registrar Enmienda ({enmienda.deltas.length} piezas)
                </Button>
              )}

              {enmienda.resumen.hayCambios && (
                <Button
                  variant="secondary"
                  onClick={enmienda.descartarTodo}
                  style={{ fontSize: '12px', padding: '6px 12px', color: 'var(--danger)' }}
                >
                  🗑️ Descartar Cambios
                </Button>
              )}

              <Button
                variant="secondary"
                onClick={enmienda.salirModoEnmienda}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                ✕ Cancelar Enmienda
              </Button>
            </div>
          </div>

          {enmienda.versionActualCambio && (
            <div style={{ marginTop: '10px', background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '8px 12px', borderRadius: '4px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                ⚠️ <strong>Conflicto Concurrente (INV-ODO-06):</strong> La enmienda fue preparada sobre la versión <strong>v{enmienda.versionEsperadaOriginal}</strong>, pero el odontograma maestro en el servidor avanzó a la versión <strong>v{odontograma?.version}</strong>. El borrador histórico se conserva.
              </div>
              <Button
                variant="secondary"
                onClick={enmienda.revisarYAlinearConflicto}
                style={{ fontSize: '11px', padding: '4px 10px', borderColor: '#b91c1c', color: '#b91c1c' }}
                title="Acepta explícitamente la versión vigente del servidor manteniendo los cambios en borrador"
              >
                🔄 Aceptar v{odontograma?.version} y desbloquear
              </Button>
            </div>
          )}

          {enmienda.errorValidacion && (
            <div style={{ marginTop: '10px', background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '6px 12px', borderRadius: '4px', fontSize: '12px' }}>
              ❌ {enmienda.errorValidacion}
            </div>
          )}
        </header>

        {enmienda.resumen.hayCambios && (
          <PanelCambiosPendientes
            resumen={enmienda.resumen}
            deltas={enmienda.deltas}
            onDescartarPieza={enmienda.descartarCambiosPieza}
            onDescartarTodo={enmienda.descartarTodo}
            onSalir={enmienda.salirModoEnmienda}
            onAbrirRegistroRevision={() => setModalEnmiendaAbierto(true)}
          />
        )}

        <ArcadaDental
          piezasMap={enmienda.piezasProyectadasMap}
          selectedNumeroFDI={fdiActivo}
          onSelectPieza={setUserSelectedFDI}
          fdisModificadosSet={enmienda.fdisModificadosSet}
        />

        <div className="detalle-layout">
          {fdiActivo ? (
            <SuperficiesDentales
              numeroFDI={fdiActivo}
              superficies={piezaBorradorHistorica?.superficies || {}}
            />
          ) : (
            <div className="superficies-card" style={{ justifyContent: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Seleccione una pieza dental para corregir sus superficies en esta enmienda.
              </span>
            </div>
          )}

          <EditorPiezaDental
            numeroFDI={fdiActivo}
            piezaOriginal={piezaOriginalHistorica}
            piezaBorrador={piezaBorradorHistorica}
            tieneCambios={enmienda.fdisModificadosSet.has(fdiActivo)}
            onActualizar={(cambios) => enmienda.prepararCambioPieza(fdiActivo, cambios)}
            onDescartar={() => enmienda.descartarCambiosPieza(fdiActivo)}
          />
        </div>

        <LeyendaClinica />

        {modalEnmiendaAbierto && (
          <ModalRegistrarEnmienda
            isOpen={modalEnmiendaAbierto}
            onClose={() => setModalEnmiendaAbierto(false)}
            odontograma={odontograma}
            revisionCorregida={enmienda.revisionCorregida}
            deltas={enmienda.deltas}
            resumen={enmienda.resumen}
            motivoRevision={enmienda.motivoRevision}
            onMotivoChange={enmienda.setMotivoRevision}
            fechaObservacion={enmienda.fechaObservacion}
            onFechaObservacionChange={enmienda.setFechaObservacion}
            consultaId={enmienda.consultaId}
            onConsultaIdChange={enmienda.setConsultaId}
            validacionMetadatos={enmienda.validacionMetadatos}
            payloadGenerado={enmienda.payloadGenerado}
            versionActualCambio={enmienda.versionActualCambio}
            versionEsperadaOriginal={enmienda.versionEsperadaOriginal}
            onResolverConflicto={enmienda.revisarYAlinearConflicto}
            escrituraHabilitada={escrituraHabilitada}
            isSubmitting={isSubmitting}
            error={errorRegistro}
            onConfirmar={async (payload) => {
              if (onRegistrarRevision) {
                const res = await onRegistrarRevision(odontograma.id, payload);
                if (res) {
                  enmienda.descartarTodo();
                  enmienda.salirModoEnmienda();
                  setModalEnmiendaAbierto(false);
                }
                return res;
              }
            }}
            onSimularEnvio={onSimularEnvio}
          />
        )}
      </div>
    );
  }

  // Si hay un snapshot histórico seleccionado para inspección inmutable
  if (snapshotSeleccionado) {
    return (
      <div className="odontograma-container" aria-label="Visor de Snapshot Histórico">
        <SnapshotHistoricoViewer
          revision={snapshotSeleccionado}
          onVolver={onVolverDeSnapshot}
          onIniciarEnmienda={handleIniciarEnmienda}
        />
      </div>
    );
  }

  // Si está cargando un snapshot histórico seleccionado
  if (loadingSnapshot) {
    return (
      <div className="odontograma-container" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Spinner dark />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
          Recuperando snapshot histórico sellado de las 52 piezas dentales...
        </p>
      </div>
    );
  }

  const piezaSeleccionada = selectedNumeroFDI ? activePiezasMap[selectedNumeroFDI] : null;

  return (
    <div className="odontograma-container" aria-label="Visor del Odontograma">
      {/* Pestañas de navegación de alto nivel: Estado Actual vs Historial Longitudinal */}
      <nav className="odontograma-tabs-nav" role="tablist" aria-label="Vistas del odontograma">
        <button
          type="button"
          role="tab"
          aria-selected={vistaActiva === 'ACTUAL'}
          className={`tab-nav-btn ${vistaActiva === 'ACTUAL' ? 'active' : ''}`}
          onClick={() => setVistaActiva('ACTUAL')}
        >
          🦷 Estado Actual Consolidado
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vistaActiva === 'HISTORIAL'}
          className={`tab-nav-btn ${vistaActiva === 'HISTORIAL' ? 'active' : ''}`}
          onClick={() => {
            setVistaActiva('HISTORIAL');
            if (odontograma?.id && onCargarHistorial && historial.revisiones.length === 0) {
              void onCargarHistorial(0, historial.limite || 20);
            }
          }}
        >
          📜 Historial del Odontograma
          <Badge variant="secondary" style={{ marginLeft: '6px', fontSize: '11px' }}>
            {historial.total || odontograma?.totalRevisiones || 0}
          </Badge>
        </button>
      </nav>

      {/* Vista de Historial Longitudinal */}
      {vistaActiva === 'HISTORIAL' && (
        <HistorialOdontograma
          odontogramaId={odontograma.id}
          historial={historial}
          loading={loadingHistorial}
          onCargarPagina={onCargarHistorial}
          onSeleccionarRevision={onSeleccionarRevision}
          onIniciarEnmienda={handleIniciarEnmienda}
          consultaIdFiltro={consultaIdContexto}
          revisionesConsulta={revisionesConsulta}
        />
      )}

      {/* Vista de Estado Actual Consolidado */}
      {vistaActiva === 'ACTUAL' && (
        <>
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
        </>
      )}

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
                  return await onSimularEnvio(payload);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
