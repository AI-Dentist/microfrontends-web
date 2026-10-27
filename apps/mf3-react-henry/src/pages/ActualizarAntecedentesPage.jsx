import { useState, useEffect, useCallback } from 'react';
import { useClinicalServices } from '../context/ClinicalServices.jsx';
import { useDevAuth } from '../hooks/useDevAuth.js';
import { Card } from '../components/common/Card.jsx';
import { Input } from '../components/common/Input.jsx';
import { Button } from '../components/common/Button.jsx';
import { Alert } from '../components/common/Alert.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { EstadoBadge } from '../components/historia-clinica/EstadoBadge.jsx';
import { AntecedentesForm } from '../components/historia-clinica/AntecedentesForm.jsx';
import { HistoriaClinicaDetail } from '../components/historia-clinica/HistoriaClinicaDetail.jsx';
import { validateAntecedentes, serializeAntecedentes } from '../components/historia-clinica/antecedentes-utils.js';

export function ActualizarAntecedentesPage({ initialHistoriaId }) {
  const { token, currentIdentity } = useDevAuth();
  const historiasClinicasService = useClinicalServices();

  const [searchId, setSearchId] = useState(initialHistoriaId || '');
  const [historiaActual, setHistoriaActual] = useState(null);
  const [loadingHistoria, setLoadingHistoria] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [antecedentes, setAntecedentes] = useState(null);
  const [descripcionAuditoria, setDescripcionAuditoria] = useState('Actualización de antecedentes tras anamnesis clínica.');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [historiaActualizada, setHistoriaActualizada] = useState(null);

  // Carga inicial o por ID
  const cargarExpediente = useCallback(
    async (idParaCargar) => {
      const id = idParaCargar || searchId;
      if (!id || !id.trim()) {
        setLoadError({
          title: 'ID Requerido',
          detail: 'Ingrese el ID canónico de la historia clínica para cargar sus antecedentes.',
        });
        return;
      }

      setLoadingHistoria(true);
      setLoadError(null);
      setUpdateError(null);
      setHistoriaActualizada(null);

      try {
        const data = await historiasClinicasService.getById(id.trim(), token);
        setHistoriaActual(data);
        setAntecedentes(data.antecedentes || {});
      } catch (err) {
        setLoadError(err);
        setHistoriaActual(null);
      } finally {
        setLoadingHistoria(false);
      }
    },
    [searchId, token, historiasClinicasService],
  );

  useEffect(() => {
    if (!initialHistoriaId) return;

    let isMounted = true;
    const fetchInitial = async () => {
      setLoadingHistoria(true);
      setLoadError(null);
      setUpdateError(null);
      setHistoriaActualizada(null);
      try {
        const data = await historiasClinicasService.getById(initialHistoriaId.trim(), token);
        if (isMounted) {
          setHistoriaActual(data);
          setAntecedentes(data.antecedentes || {});
        }
      } catch (err) {
        if (isMounted) {
          setLoadError(err);
          setHistoriaActual(null);
        }
      } finally {
        if (isMounted) {
          setLoadingHistoria(false);
        }
      }
    };

    void fetchInitial();

    return () => {
      isMounted = false;
    };
  }, [initialHistoriaId, token, historiasClinicasService]);

  const handleRecargarConflict = () => {
    setUpdateError(null);
    setValidationErrors([]);
    if (historiaActual?.id) {
      void cargarExpediente(historiaActual.id);
    }
  };

  const handleActualizar = async (e) => {
    e.preventDefault();
    setUpdateError(null);
    setValidationErrors([]);
    setHistoriaActualizada(null);

    if (!historiaActual) return;

    if (historiaActual.estado !== 'ACTIVA') {
      setValidationErrors([
        `No es posible modificar antecedentes: el expediente se encuentra en estado '${historiaActual.estado}'. Solo se permite editar expedientes en estado 'ACTIVA'.`,
      ]);
      return;
    }

    // Validación de reglas clínicas
    const errs = validateAntecedentes(antecedentes);
    if (errs.length > 0) {
      setValidationErrors(errs);
      return;
    }

    setUpdating(true);

    const payload = {
      versionEsperada: historiaActual.version,
      nuevosAntecedentes: serializeAntecedentes(antecedentes),
      camposModificados: [
        'antecedentes.antecedentesOdontologicos',
        'antecedentes.enfermedadesCronicas',
        'antecedentes.antecedentesMedicos',
        'antecedentes.antecedentesFamiliares',
      ],
      descripcion: descripcionAuditoria?.trim() || 'Actualización de antecedentes',
    };

    try {
      const updated = await historiasClinicasService.updateAntecedentes(
        historiaActual.id,
        payload,
        token,
      );
      setHistoriaActualizada(updated);
      setHistoriaActual(updated);
      setAntecedentes(updated.antecedentes);
    } catch (err) {
      setUpdateError(err);
    } finally {
      setUpdating(false);
    }
  };

  const esCerrada = historiaActual && historiaActual.estado !== 'ACTIVA';
  const esConflicto409 = updateError && updateError.status === 409;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Selector de expediente a modificar */}
      <Card title="Seleccionar Historia Clínica para Modificar Antecedentes">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void cargarExpediente();
          }}
          className="search-bar-container"
        >
          <Input
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Ingrese el ID canónico (ej. hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a)"
            disabled={loadingHistoria || updating}
          />

          <Button
            type="submit"
            loading={loadingHistoria}
            disabled={!searchId.trim() || updating}
          >
            Cargar Expediente
          </Button>
        </form>

        {loadError && (
          <Alert
            title={loadError.title}
            detail={loadError.detail}
            status={loadError.status}
            onClose={() => setLoadError(null)}
          />
        )}
      </Card>

      {/* 2. Formulario de Edición */}
      {loadingHistoria && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <Spinner dark />
          <p style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '14px' }}>
            Cargando antecedentes del expediente...
          </p>
        </div>
      )}

      {historiaActual && !loadingHistoria && (
        <form onSubmit={handleActualizar}>
          <Card>
            {/* Cabecera del expediente en edición */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '16px',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700 }}>
                  Expediente en Edición: <code>{historiaActual.id}</code>
                </h3>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Paciente: <code>{historiaActual.pacienteId}</code> • Operador activo: <strong>{currentIdentity?.nombre}</strong>
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <EstadoBadge estado={historiaActual.estado} />
                <span
                  style={{
                    background: 'var(--primary-light)',
                    color: 'var(--primary-dark)',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                  }}
                  title="Versión concurrente en base de datos"
                >
                  Versión actual: v{historiaActual.version}
                </span>
              </div>
            </div>

            {/* Aviso si el expediente está cerrado */}
            {esCerrada && (
              <Alert
                title="Expediente Clínico No Editable (HTTP 422)"
                detail={`Este expediente se encuentra en estado '${historiaActual.estado}'. La regla de dominio prohíbe modificar antecedentes de historias clínicas cerradas o archivadas. Para modificarlo, debe ser reabierto a estado ACTIVA.`}
                type="warning"
              />
            )}

            {/* Banner específico para Concurrencia Optimista 409 */}
            {esConflicto409 && (
              <div
                style={{
                  background: 'var(--warning-bg)',
                  border: '2px solid var(--warning)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '24px' }}>⚠️</span>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 6px', color: 'var(--warning)', fontWeight: 800, fontSize: '16px' }}>
                      Conflicto de Concurrencia Optimista (HTTP 409)
                    </h4>
                    <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-primary)' }}>
                      {updateError.detail || 'Otro odontólogo o proceso modificó este expediente mientras lo editabas en pantalla.'}
                      <br />
                      <strong>Política de integridad clínica:</strong> Los cambios no se sobrescribieron silenciosamente para evitar pérdida de datos. Debe recargar la versión más reciente desde la base de datos.
                    </p>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleRecargarConflict}
                    >
                      🔄 Recargar Versión Actualizada y Comparar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Otros errores del servidor */}
            {updateError && !esConflicto409 && (
              <Alert
                title={updateError.title}
                detail={updateError.detail}
                status={updateError.status}
                invalidParams={updateError.invalidParams}
                onClose={() => setUpdateError(null)}
              />
            )}

            {/* Errores de validación cliente */}
            {validationErrors.length > 0 && (
              <Alert
                title="Inconsistencias Clínicas"
                detail="Corrija los siguientes requerimientos antes de actualizar:"
                type="warning"
                invalidParams={validationErrors.map((msg, i) => ({ name: `Regla ${i + 1}`, reason: msg }))}
                onClose={() => setValidationErrors([])}
              />
            )}

            {/* Mensaje de éxito tras actualizar */}
            {historiaActualizada && (
              <Alert
                title="Antecedentes Actualizados Exitosamente"
                detail={`Se registraron las modificaciones y la versión concurrente avanzó a v${historiaActualizada.version}.`}
                type="info"
              />
            )}

            {/* Justificación de auditoría */}
            <div style={{ marginBottom: '24px' }}>
              <label
                htmlFor="descripcionAuditoria"
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}
              >
                Motivo / Justificación del Cambio (Auditoría Médica) *
              </label>
              <input
                id="descripcionAuditoria"
                type="text"
                value={descripcionAuditoria}
                disabled={updating || esCerrada}
                onChange={(e) => setDescripcionAuditoria(e.target.value)}
                placeholder="ej. Se añade confirmación de hipertensión arterial tras control de presión."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                }}
              />
            </div>

            {/* Formulario interactivo de antecedentes */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginBottom: '24px' }}>
              <AntecedentesForm
                value={antecedentes}
                onChange={setAntecedentes}
                disabled={updating || esCerrada}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <Button
                type="submit"
                loading={updating}
                disabled={esCerrada || updating}
              >
                Guardar Actualización de Antecedentes (v{historiaActual.version} → v{historiaActual.version + 1})
              </Button>
            </div>
          </Card>
        </form>
      )}

      {/* Si se actualizó, mostrar el detalle completo verificado desde la API */}
      {historiaActualizada && (
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px' }}>
            Expediente Clínico Recuperado Tras la Actualización:
          </h3>
          <HistoriaClinicaDetail historia={historiaActualizada} />
        </div>
      )}
    </div>
  );
}
