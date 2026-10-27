import { useState, useEffect, useCallback } from 'react';
import { useOdontograma } from '../hooks/useOdontograma.js';
import { useDevAuth } from '../hooks/useDevAuth.js';
import { odontogramasService } from '../api/odontogramas.service.js';
import { Card } from '../components/common/Card.jsx';
import { Input } from '../components/common/Input.jsx';
import { Button } from '../components/common/Button.jsx';
import { OdontogramaViewer } from '../components/odontograma/OdontogramaViewer.jsx';

const SUGGESTED_HISTORIAS = [
  { label: 'Historia E2E Activa', valor: 'hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a' },
  { label: 'Historia Dennis 001', valor: 'hc_12345678-aaaa-bbbb' },
  { label: 'Historia Sin Odontograma (404)', valor: 'hc_00000000-0000-0000-0000-000000000000' },
];

/**
 * Pantalla para la consulta visual del Odontograma Longitudinal en React.
 *
 * @param {object} props
 * @param {string} [props.initialHistoriaId=''] - ID de historia clínica precargada
 * @param {Function} [props.onVolverAHistoria] - Navegar al expediente clínico
 * @param {Function} [props.onVerConsultas] - Navegar a las consultas
 */
export function OdontogramaPage({
  initialHistoriaId = '',
  onVolverAHistoria,
  onVerConsultas,
}) {
  const { token } = useDevAuth();
  const [historiaInput, setHistoriaInput] = useState(initialHistoriaId);
  const [historiaConsultada, setHistoriaConsultada] = useState(initialHistoriaId);

  // Detección del backend aislado en puerto 3002
  const [esEntornoAislado, setEsEntornoAislado] = useState(() => {
    if (typeof window === 'undefined') return false;
    const urlParam = new URLSearchParams(window.location.search).get('apiPort');
    if (urlParam === '3002') return true;
    return Boolean(
      window.__ODONTOGRAMA_TEST_API_URL__?.includes('3002') ||
      window.localStorage?.getItem('ODONTOGRAMA_TEST_API_URL')?.includes('3002')
    );
  });
  const [verificandoAislamiento, setVerificandoAislamiento] = useState(false);

  const {
    loading,
    loadingHistorial,
    loadingSnapshot,
    isSubmitting,
    error,
    conflict,
    successMessage,
    odontogramaActual,
    historial,
    snapshotSeleccionado,
    revisionesConsulta,
    cargarOdontogramaActual,
    inicializarOdontograma,
    registrarRevision,
    cargarHistorial,
    cargarSnapshotRevision,
    limpiarSnapshot,
    limpiarError,
    limpiarMensaje,
    setOdontogramaActual,
  } = useOdontograma();

  // Función para activar o verificar la conexión con el backend aislado en puerto 3002
  const verificarConexionAislada = useCallback(async (activar = true) => {
    setVerificandoAislamiento(true);
    try {
      if (activar) {
        window.__ODONTOGRAMA_TEST_API_URL__ = 'http://127.0.0.1:3002/api/expediente';
        window.localStorage?.setItem('ODONTOGRAMA_TEST_API_URL', 'http://127.0.0.1:3002/api/expediente');
      } else {
        delete window.__ODONTOGRAMA_TEST_API_URL__;
        window.localStorage?.removeItem('ODONTOGRAMA_TEST_API_URL');
      }

      const res = await odontogramasService.consultarEstadoEntornoAislado(token);
      if (res?.aislado && res?.puertoMongo === 27018) {
        setEsEntornoAislado(true);
      } else {
        delete window.__ODONTOGRAMA_TEST_API_URL__;
        window.localStorage?.removeItem('ODONTOGRAMA_TEST_API_URL');
        setEsEntornoAislado(false);
      }
    } catch {
      delete window.__ODONTOGRAMA_TEST_API_URL__;
      window.localStorage?.removeItem('ODONTOGRAMA_TEST_API_URL');
      setEsEntornoAislado(false);
    } finally {
      setVerificandoAislamiento(false);
    }
  }, [token]);

  // Si está presente el parámetro apiPort=3002 o ya estaba configurado, verificar conexión al montar
  useEffect(() => {
    let activo = true;
    const urlParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('apiPort') : null;
    if (urlParam === '3002' || esEntornoAislado) {
      odontogramasService.consultarEstadoEntornoAislado(token)
        .then((res) => {
          if (activo) {
            setEsEntornoAislado(Boolean(res?.aislado && res?.puertoMongo === 27018));
          }
        })
        .catch(() => {
          if (activo) {
            delete window.__ODONTOGRAMA_TEST_API_URL__;
            window.localStorage?.removeItem('ODONTOGRAMA_TEST_API_URL');
            setEsEntornoAislado(false);
          }
        });
    }
    return () => {
      activo = false;
    };
  }, [token, esEntornoAislado]);

  // Si se provee un initialHistoriaId, cargar su odontograma actual al montar
  useEffect(() => {
    if (initialHistoriaId && initialHistoriaId.trim()) {
      void cargarOdontogramaActual(initialHistoriaId.trim());
    }
  }, [initialHistoriaId, cargarOdontogramaActual]);

  const handleInicializarOdontograma = async () => {
    if (!historiaConsultada.trim()) return;
    const confirmar = window.confirm(
      `¿Desea inicializar el odontograma longitudinal para la historia clínica "${historiaConsultada}"?\n\nSe crearán las 52 posiciones FDI en estado basal (DESCONOCIDO y NO_EVALUADO) exclusivamente en MongoDB temporal 27018.`
    );
    if (!confirmar) return;

    limpiarError();
    const resultado = await inicializarOdontograma(historiaConsultada.trim());
    if (resultado) {
      void cargarOdontogramaActual(historiaConsultada.trim());
    }
  };

  const handleBuscar = (e) => {
    if (e) e.preventDefault();
    if (!historiaInput.trim()) return;

    limpiarError();
    setOdontogramaActual(null);
    setHistoriaConsultada(historiaInput.trim());
    void cargarOdontogramaActual(historiaInput.trim());
  };

  const handleSelectChip = (chipValor) => {
    setHistoriaInput(chipValor);
    setHistoriaConsultada(chipValor);
    limpiarError();
    setOdontogramaActual(null);
    void cargarOdontogramaActual(chipValor);
  };

  const handleLimpiar = () => {
    setHistoriaInput('');
    setHistoriaConsultada('');
    limpiarError();
    setOdontogramaActual(null);
  };

  const handleRecargar = () => {
    if (historiaConsultada.trim()) {
      void cargarOdontogramaActual(historiaConsultada.trim());
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Buscador de Odontograma por Historia Clínica */}
      <Card title="Odontograma Clínico — Expediente Dental">
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: 0, marginBottom: '16px' }}>
          Visualización anatómica estandarizada de las 52 posiciones FDI (32 permanentes y 20 temporales) y condiciones clínicas por superficie.
        </p>

        <form onSubmit={handleBuscar} className="search-bar-container">
          <Input
            value={historiaInput}
            onChange={(e) => setHistoriaInput(e.target.value)}
            placeholder="Ingrese el ID canónico de la historia clínica (ej. hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a)"
            aria-label="Identificador de la historia clínica"
            disabled={loading}
          />

          <Button type="submit" loading={loading} disabled={!historiaInput.trim()}>
            Cargar Odontograma
          </Button>

          {(historiaInput || odontogramaActual || error) && (
            <Button variant="secondary" onClick={handleLimpiar} disabled={loading}>
              Limpiar
            </Button>
          )}

          {onVolverAHistoria && historiaConsultada && (
            <Button
              variant="secondary"
              onClick={() => onVolverAHistoria(historiaConsultada)}
              style={{ marginLeft: 'auto' }}
            >
              📋 Ver Expediente
            </Button>
          )}

          {onVerConsultas && historiaConsultada && (
            <Button
              variant="secondary"
              onClick={() => onVerConsultas(historiaConsultada)}
            >
              🦷 Consultas
            </Button>
          )}
        </form>

        {/* Chips sugeridos */}
        <div className="quick-chips-container">
          <span>Identificadores de prueba:</span>
          {SUGGESTED_HISTORIAS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              className="quick-chip"
              onClick={() => handleSelectChip(chip.valor)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Notificación de éxito post-registro */}
      {successMessage && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', borderRadius: 'var(--radius-md)', padding: '12px 16px', fontSize: '14px' }}>
          <span>✅ {successMessage}</span>
          <button
            type="button"
            onClick={limpiarMensaje}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#065f46' }}
            aria-label="Cerrar mensaje"
          >
            ✕
          </button>
        </div>
      )}

      {/* Banner de Estado de Aislamiento Clínico */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: esEntornoAislado ? '#ecfdf5' : '#f8fafc',
        border: `1px solid ${esEntornoAislado ? '#10b981' : '#cbd5e1'}`,
        borderRadius: 'var(--radius-md)',
        padding: '10px 16px',
        fontSize: '13px',
        color: esEntornoAislado ? '#065f46' : 'var(--text-secondary)',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{esEntornoAislado ? '🟢' : '⚪'}</span>
          <span>
            <strong>{esEntornoAislado ? 'Entorno Aislado Activo:' : 'Entorno Estándar:'}</strong>{' '}
            {esEntornoAislado
              ? 'Conectado a Backend Aislado (puerto 3002) y MongoDB temporal (puerto 27018 / rs_odontograma_test). Escritura transaccional habilitada.'
              : 'Conectado al Gateway Nginx principal. Persistencia transaccional bloqueada para salvaguarda de 127.0.0.1:27017.'}
          </span>
        </div>
        <Button
          variant="secondary"
          onClick={() => void verificarConexionAislada(!esEntornoAislado)}
          loading={verificandoAislamiento}
          style={{ fontSize: '11px', padding: '4px 10px' }}
        >
          {esEntornoAislado ? 'Cambiar a Principal (3001)' : '🧪 Conectar a Backend Aislado (3002)'}
        </Button>
      </div>

      {/* Visor interactivo del Odontograma con flujo de revisión y visor longitudinal */}
      <OdontogramaViewer
        odontograma={odontogramaActual}
        loading={loading}
        error={error}
        onRecargar={handleRecargar}
        historiaClinicaId={historiaConsultada}
        onRegistrarRevision={registrarRevision}
        isSubmitting={isSubmitting}
        errorRegistro={error}
        conflictRegistro={conflict}
        escrituraHabilitada={esEntornoAislado}
        onInicializarOdontograma={handleInicializarOdontograma}
        historial={historial}
        loadingHistorial={loadingHistorial}
        onCargarHistorial={(offset, limite) => {
          if (odontogramaActual?.id) {
            void cargarHistorial(odontogramaActual.id, { offset, limite });
          }
        }}
        snapshotSeleccionado={snapshotSeleccionado}
        loadingSnapshot={loadingSnapshot}
        onSeleccionarRevision={(rev) => {
          if (odontogramaActual?.id && rev?.id) {
            void cargarSnapshotRevision(odontogramaActual.id, rev.id);
          }
        }}
        onVolverDeSnapshot={limpiarSnapshot}
        onCargarSnapshotRevision={cargarSnapshotRevision}
        revisionesConsulta={revisionesConsulta}
      />
    </div>
  );
}
