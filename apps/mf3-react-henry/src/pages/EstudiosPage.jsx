/* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/common/Card.jsx';
import { Button } from '../components/common/Button.jsx';
import { Input } from '../components/common/Input.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { Alert } from '../components/common/Alert.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { useDevAuth } from '../hooks/useDevAuth.js';
import { estudiosService } from '../api/estudios.service.js';
import { TipoEstudioModal } from '../components/estudios/TipoEstudioModal.jsx';
import { LaboratorioModal } from '../components/estudios/LaboratorioModal.jsx';
import { SolicitarEstudioModal } from '../components/estudios/SolicitarEstudioModal.jsx';
import { RegistrarResultadoModal } from '../components/estudios/RegistrarResultadoModal.jsx';
import { CambiarEstadoSolicitudModal } from '../components/estudios/CambiarEstadoSolicitudModal.jsx';
import { DetalleSolicitudModal } from '../components/estudios/DetalleSolicitudModal.jsx';

export function EstudiosPage({
  initialSubtab = 'tipos',
  initialHistoriaId = '',
  initialConsultaId = '',
  onVerHistoria,
  onVerConsulta,
}) {
  const { token } = useDevAuth();
  const [subtab, setSubtab] = useState(initialSubtab); // 'tipos' | 'laboratorios' | 'historial' | 'solicitar'

  // Estados Catálogo Tipos de Estudio
  const [tiposEstudio, setTiposEstudio] = useState([]);
  const [loadingTipos, setLoadingTipos] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [soloActivosTipos, setSoloActivosTipos] = useState(false);
  const [tipoModalOpen, setTipoModalOpen] = useState(false);
  const [tipoAEditar, setTipoAEditar] = useState(null);

  // Estados Catálogo Laboratorios
  const [laboratorios, setLaboratorios] = useState([]);
  const [loadingLabs, setLoadingLabs] = useState(false);
  const [soloActivosLabs, setSoloActivosLabs] = useState(false);
  const [labModalOpen, setLabModalOpen] = useState(false);
  const [labAEditar, setLabAEditar] = useState(null);

  // Estados Historial / Solicitudes
  const [historiaSearchId, setHistoriaSearchId] = useState(initialHistoriaId || '');
  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(false);
  const [solicitarModalOpen, setSolicitarModalOpen] = useState(false);
  const [consultaParaSolicitar, setConsultaParaSolicitar] = useState(initialConsultaId || '');
  const [resultadoModalOpen, setResultadoModalOpen] = useState(false);
  const [estadoModalOpen, setEstadoModalOpen] = useState(false);
  const [detalleModalOpen, setDetalleModalOpen] = useState(false);
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState(null);

  // Error general
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // ==========================================
  // Carga de datos
  // ==========================================

  const cargarTipos = useCallback(async () => {
    setLoadingTipos(true);
    setError(null);
    try {
      const data = await estudiosService.listarTiposEstudio({
        categoria: filtroCategoria || undefined,
        soloActivos: soloActivosTipos ? true : undefined,
      }, token);
      setTiposEstudio(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingTipos(false);
    }
  }, [filtroCategoria, soloActivosTipos, token]);

  const cargarLaboratorios = useCallback(async () => {
    setLoadingLabs(true);
    setError(null);
    try {
      const data = await estudiosService.listarLaboratorios({
        soloActivos: soloActivosLabs ? true : undefined,
      }, token);
      setLaboratorios(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingLabs(false);
    }
  }, [soloActivosLabs, token]);

  const cargarHistorial = useCallback(async (hId) => {
    const id = (hId !== undefined ? hId : historiaSearchId)?.trim();
    if (!id) return;
    setLoadingSolicitudes(true);
    setError(null);
    try {
      const data = await estudiosService.listarSolicitudesPorHistoria(id, token);
      setSolicitudes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err);
      setSolicitudes([]);
    } finally {
      setLoadingSolicitudes(false);
    }
  }, [historiaSearchId, token]);

  useEffect(() => {
    if (subtab === 'tipos') {
      void cargarTipos();
    } else if (subtab === 'laboratorios') {
      void cargarLaboratorios();
    } else if (subtab === 'historial') {
      if (initialHistoriaId) {
        setHistoriaSearchId(initialHistoriaId);
        void cargarHistorial(initialHistoriaId);
      }
    }
  }, [subtab, cargarTipos, cargarLaboratorios, cargarHistorial, initialHistoriaId]);

  // ==========================================
  // Handlers Tipos de Estudio
  // ==========================================

  const handleGuardarTipo = async ({ id, payload }) => {
    if (id) {
      await estudiosService.actualizarTipoEstudio(id, payload, token);
      setSuccessMsg(`Tipo de estudio "${payload.nombre}" actualizado correctamente.`);
    } else {
      await estudiosService.crearTipoEstudio(payload, token);
      setSuccessMsg(`Tipo de estudio "${payload.nombre}" registrado exitosamente.`);
    }
    await cargarTipos();
  };

  const handleToggleEstadoTipo = async (tipo) => {
    const nuevo = tipo.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      await estudiosService.cambiarEstadoTipoEstudio(tipo.id, nuevo, token);
      setSuccessMsg(`Estado de "${tipo.nombre}" cambiado a ${nuevo}.`);
      await cargarTipos();
    } catch (err) {
      setError(err);
    }
  };

  // ==========================================
  // Handlers Laboratorios
  // ==========================================

  const handleGuardarLab = async ({ id, payload }) => {
    if (id) {
      await estudiosService.actualizarLaboratorio(id, payload, token);
      setSuccessMsg(`Laboratorio "${payload.nombre}" actualizado correctamente.`);
    } else {
      await estudiosService.crearLaboratorio(payload, token);
      setSuccessMsg(`Laboratorio "${payload.nombre}" registrado exitosamente.`);
    }
    await cargarLaboratorios();
  };

  const handleToggleEstadoLab = async (lab) => {
    const nuevo = lab.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      await estudiosService.cambiarEstadoLaboratorio(lab.id, nuevo, token);
      setSuccessMsg(`Estado de "${lab.nombre}" cambiado a ${nuevo}.`);
      await cargarLaboratorios();
    } catch (err) {
      setError(err);
    }
  };

  // ==========================================
  // Handlers Solicitudes y Resultados
  // ==========================================

  const handleBuscarHistorialSubmit = (e) => {
    e.preventDefault();
    void cargarHistorial();
  };

  const handleSolicitudCreada = (nueva) => {
    setSuccessMsg(`Solicitud de estudio "${nueva.codigoEstudio}" creada exitosamente con ID ${nueva.id}.`);
    if (nueva.historiaClinicaId) {
      setHistoriaSearchId(nueva.historiaClinicaId);
      setSubtab('historial');
      void cargarHistorial(nueva.historiaClinicaId);
    }
  };

  const handleResultadoRegistrado = (actualizada) => {
    setSuccessMsg(`Resultado registrado para la solicitud ${actualizada.id}. El estudio ha pasado a COMPLETADO.`);
    if (historiaSearchId) {
      void cargarHistorial(historiaSearchId);
    }
    setSolicitudSeleccionada(actualizada);
  };

  const handleEstadoCambiado = (actualizada) => {
    setSuccessMsg(`Estado de la solicitud ${actualizada.id} actualizado a ${actualizada.estado}.`);
    if (historiaSearchId) {
      void cargarHistorial(historiaSearchId);
    }
    setSolicitudSeleccionada(actualizada);
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case 'SOLICITADO': return <Badge variant="info">SOLICITADO</Badge>;
      case 'EN_PROCESO': return <Badge variant="warning">EN PROCESO</Badge>;
      case 'COMPLETADO': return <Badge variant="success">COMPLETADO</Badge>;
      case 'CANCELADO': return <Badge variant="danger">CANCELADO</Badge>;
      default: return <Badge variant="neutral">{st}</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Encabezado y subtabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary)' }}>
            🔬 Sistema de Información Clínica: Estudios e Imagenología
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Gestión integral de laboratorios, catálogo de estudios diagnósticos, solicitudes y resultados clínicos
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant={subtab === 'tipos' ? 'primary' : 'secondary'}
            onClick={() => setSubtab('tipos')}
            style={{ fontSize: '13px', padding: '6px 12px' }}
          >
            📋 Tipos de Estudio
          </Button>
          <Button
            variant={subtab === 'laboratorios' ? 'primary' : 'secondary'}
            onClick={() => setSubtab('laboratorios')}
            style={{ fontSize: '13px', padding: '6px 12px' }}
          >
            🏥 Laboratorios
          </Button>
          <Button
            variant={subtab === 'historial' ? 'primary' : 'secondary'}
            onClick={() => setSubtab('historial')}
            style={{ fontSize: '13px', padding: '6px 12px' }}
          >
            📁 Historial por Paciente
          </Button>
          <Button
            variant={subtab === 'solicitar' ? 'primary' : 'secondary'}
            onClick={() => {
              setConsultaParaSolicitar(initialConsultaId || '');
              setSolicitarModalOpen(true);
            }}
            style={{ fontSize: '13px', padding: '6px 12px' }}
          >
            ➕ Solicitar Estudio
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {successMsg && (
        <Alert
          title="Operación Exitosa"
          detail={successMsg}
          status={200}
          onClose={() => setSuccessMsg(null)}
        />
      )}
      {error && (
        <Alert
          title={error.title || 'Error en Estudios Clínicos'}
          detail={error.detail || error.message}
          status={error.status}
          invalidParams={error.invalidParams}
          onClose={() => setError(null)}
        />
      )}

      {/* SUBTAB 1: TIPOS DE ESTUDIO */}
      {subtab === 'tipos' && (
        <Card
          title="Catálogo de Tipos de Estudios Clínicos y de Imagenología"
          action={
            <Button
              variant="primary"
              onClick={() => {
                setTipoAEditar(null);
                setTipoModalOpen(true);
              }}
              style={{ fontSize: '13px' }}
            >
              ➕ Nuevo Tipo de Estudio
            </Button>
          }
        >
          {/* Filtros */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Categoría:</span>
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                <option value="">Todas las categorías</option>
                <option value="LABORATORIO">🔬 LABORATORIO</option>
                <option value="IMAGENOLOGIA">🩻 IMAGENOLOGÍA</option>
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={soloActivosTipos}
                onChange={(e) => setSoloActivosTipos(e.target.checked)}
              />
              Mostrar únicamente activos
            </label>

            <Button variant="secondary" onClick={cargarTipos} style={{ fontSize: '12px', padding: '4px 10px', marginLeft: 'auto' }}>
              🔄 Refrescar
            </Button>
          </div>

          {loadingTipos ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <Spinner dark />
              <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>Cargando catálogo...</p>
            </div>
          ) : tiposEstudio.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '14px' }}>
              No se encontraron tipos de estudios registrados en el catálogo.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px' }}>Código</th>
                    <th style={{ padding: '8px' }}>Nombre</th>
                    <th style={{ padding: '8px' }}>Categoría</th>
                    <th style={{ padding: '8px' }}>Descripción</th>
                    <th style={{ padding: '8px' }}>Estado</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tiposEstudio.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px' }}><code>{t.codigo}</code></td>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{t.nombre}</td>
                      <td style={{ padding: '8px' }}>
                        <Badge variant={t.categoria === 'IMAGENOLOGIA' ? 'primary' : 'neutral'}>
                          {t.categoria === 'IMAGENOLOGIA' ? '🩻 IMAGEN' : '🔬 LAB'}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)', maxWidth: '300px' }}>
                        {t.descripcion || '—'}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <Badge variant={t.estado === 'ACTIVO' ? 'success' : 'neutral'}>
                          {t.estado}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setTipoAEditar(t);
                              setTipoModalOpen(true);
                            }}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          >
                            ✏️ Editar
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => handleToggleEstadoTipo(t)}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          >
                            {t.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* SUBTAB 2: LABORATORIOS */}
      {subtab === 'laboratorios' && (
        <Card
          title="Catálogo de Laboratorios y Centros de Diagnóstico"
          action={
            <Button
              variant="primary"
              onClick={() => {
                setLabAEditar(null);
                setLabModalOpen(true);
              }}
              style={{ fontSize: '13px' }}
            >
              ➕ Registrar Laboratorio
            </Button>
          }
        >
          {/* Filtros */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={soloActivosLabs}
                onChange={(e) => setSoloActivosLabs(e.target.checked)}
              />
              Mostrar únicamente activos
            </label>

            <Button variant="secondary" onClick={cargarLaboratorios} style={{ fontSize: '12px', padding: '4px 10px', marginLeft: 'auto' }}>
              🔄 Refrescar
            </Button>
          </div>

          {loadingLabs ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <Spinner dark />
              <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>Cargando laboratorios...</p>
            </div>
          ) : laboratorios.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '14px' }}>
              No hay laboratorios registrados en el catálogo.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px' }}>Nombre</th>
                    <th style={{ padding: '8px' }}>Contacto / Ubicación</th>
                    <th style={{ padding: '8px' }}>Descripción</th>
                    <th style={{ padding: '8px' }}>Estado</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {laboratorios.map((lab) => (
                    <tr key={lab.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{lab.nombre}</td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{lab.contacto || '—'}</td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)', maxWidth: '280px' }}>{lab.descripcion || '—'}</td>
                      <td style={{ padding: '8px' }}>
                        <Badge variant={lab.estado === 'ACTIVO' ? 'success' : 'neutral'}>
                          {lab.estado}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setLabAEditar(lab);
                              setLabModalOpen(true);
                            }}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          >
                            ✏️ Editar
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => handleToggleEstadoLab(lab)}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          >
                            {lab.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* SUBTAB 3: HISTORIAL DE ESTUDIOS POR PACIENTE */}
      {subtab === 'historial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Card title="Historial Clínico de Estudios e Imagenología del Paciente">
            <form onSubmit={handleBuscarHistorialSubmit} className="search-bar-container">
              <Input
                value={historiaSearchId}
                onChange={(e) => setHistoriaSearchId(e.target.value)}
                placeholder="Ingrese el ID canónico de la Historia Clínica (ej. hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a)"
                aria-label="Historia clínica id"
                disabled={loadingSolicitudes}
              />
              <Button type="submit" loading={loadingSolicitudes} disabled={!historiaSearchId.trim()}>
                Buscar Historial
              </Button>
              {onVerHistoria && historiaSearchId && (
                <Button
                  variant="secondary"
                  onClick={() => onVerHistoria(historiaSearchId)}
                  type="button"
                >
                  📋 Ver Expediente
                </Button>
              )}
            </form>
          </Card>

          {loadingSolicitudes && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spinner dark />
              <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-muted)' }}>
                Recuperando historial de estudios clínicos...
              </p>
            </div>
          )}

          {!loadingSolicitudes && solicitudes.length > 0 && (
            <Card title={`Estudios Solicitados (${solicitudes.length})`}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px' }}>Fecha</th>
                      <th style={{ padding: '8px' }}>Estudio</th>
                      <th style={{ padding: '8px' }}>Prioridad</th>
                      <th style={{ padding: '8px' }}>Motivo</th>
                      <th style={{ padding: '8px' }}>Estado</th>
                      <th style={{ padding: '8px' }}>Resultado</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solicitudes.map((sol) => (
                      <tr key={sol.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                          {sol.fechaSolicitud ? new Date(sol.fechaSolicitud).toLocaleDateString() : 'N/D'}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ fontWeight: 600 }}>{sol.nombreEstudio}</div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            [{sol.categoria}] {sol.codigoEstudio}
                          </span>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Badge variant={sol.prioridad === 'URGENTE' ? 'danger' : 'neutral'}>
                            {sol.prioridad === 'URGENTE' ? '🚨 URG' : 'RUTINA'}
                          </Badge>
                        </td>
                        <td style={{ padding: '8px', maxWidth: '240px', color: 'var(--text-secondary)' }}>
                          {sol.motivo}
                        </td>
                        <td style={{ padding: '8px' }}>
                          {getStatusBadge(sol.estado)}
                        </td>
                        <td style={{ padding: '8px' }}>
                          {sol.resultado ? (
                            <span style={{ color: 'var(--color-success, #22c55e)', fontWeight: 600 }}>
                              ✓ Con informe
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Pendiente</span>
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setSolicitudSeleccionada(sol);
                                setDetalleModalOpen(true);
                              }}
                              style={{ fontSize: '12px', padding: '4px 8px' }}
                            >
                              👁️ Ver Ficha
                            </Button>

                            {sol.estado !== 'COMPLETADO' && sol.estado !== 'CANCELADO' && (
                              <>
                                <Button
                                  variant="primary"
                                  onClick={() => {
                                    setSolicitudSeleccionada(sol);
                                    setResultadoModalOpen(true);
                                  }}
                                  style={{ fontSize: '12px', padding: '4px 8px' }}
                                >
                                  📋 Resultado
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    setSolicitudSeleccionada(sol);
                                    setEstadoModalOpen(true);
                                  }}
                                  style={{ fontSize: '12px', padding: '4px 8px' }}
                                >
                                  🔄 Estado
                                </Button>
                              </>
                            )}

                            {onVerConsulta && sol.consultaId && (
                              <Button
                                variant="secondary"
                                onClick={() => onVerConsulta(sol.consultaId)}
                                style={{ fontSize: '12px', padding: '4px 8px' }}
                              >
                                🦷 Consulta
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {!loadingSolicitudes && historiaSearchId && solicitudes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', color: 'var(--text-muted)' }}>
              No se registran estudios para la historia clínica especificada.
            </div>
          )}
        </div>
      )}

      {/* Modales */}
      <TipoEstudioModal
        isOpen={tipoModalOpen}
        onClose={() => setTipoModalOpen(false)}
        tipoEstudioAEditar={tipoAEditar}
        onGuardar={handleGuardarTipo}
      />

      <LaboratorioModal
        isOpen={labModalOpen}
        onClose={() => setLabModalOpen(false)}
        laboratorioAEditar={labAEditar}
        onGuardar={handleGuardarLab}
      />

      <SolicitarEstudioModal
        isOpen={solicitarModalOpen}
        onClose={() => setSolicitarModalOpen(false)}
        initialConsultaId={consultaParaSolicitar}
        onSolicitudCreada={handleSolicitudCreada}
      />

      <RegistrarResultadoModal
        isOpen={resultadoModalOpen}
        onClose={() => setResultadoModalOpen(false)}
        solicitud={solicitudSeleccionada}
        onResultadoRegistrado={handleResultadoRegistrado}
      />

      <CambiarEstadoSolicitudModal
        isOpen={estadoModalOpen}
        onClose={() => setEstadoModalOpen(false)}
        solicitud={solicitudSeleccionada}
        onEstadoCambiado={handleEstadoCambiado}
      />

      <DetalleSolicitudModal
        isOpen={detalleModalOpen}
        onClose={() => setDetalleModalOpen(false)}
        solicitud={solicitudSeleccionada}
        onRegistrarResultadoClick={(sol) => {
          setDetalleModalOpen(false);
          setSolicitudSeleccionada(sol);
          setResultadoModalOpen(true);
        }}
        onCambiarEstadoClick={(sol) => {
          setDetalleModalOpen(false);
          setSolicitudSeleccionada(sol);
          setEstadoModalOpen(true);
        }}
      />
    </div>
  );
}
