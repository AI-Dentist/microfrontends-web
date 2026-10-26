import { useState, useMemo } from 'react';
import { ArcadaDental } from './ArcadaDental.jsx';
import { SuperficiesDentales } from './SuperficiesDentales.jsx';
import { DetallePiezaDental } from './DetallePiezaDental.jsx';
import { LeyendaClinica } from './LeyendaClinica.jsx';
import { Spinner } from '../common/Spinner.jsx';
import { Alert } from '../common/Alert.jsx';
import { Button } from '../common/Button.jsx';
import '../../styles/odontograma.css';

/**
 * Visor interactivo clínico del Odontograma Longitudinal (Iteración 7F-2).
 *
 * Modo de solo lectura:
 * - Visualización anatómica de las 52 posiciones FDI.
 * - Selección interactiva por clic o teclado sin mutación de estado persistente.
 * - Sin inicialización automática ante HTTP 404 (estado vacío informativo).
 *
 * @param {object} props
 * @param {object|null} props.odontograma - OdontogramaActualDto proveniente de useOdontograma
 * @param {boolean} [props.loading=false] - Estado de carga asíncrona
 * @param {object|null} [props.error=null] - Error de solicitud (ProblemDetailsError)
 * @param {Function} [props.onRecargar] - Callback para reintentar o recargar
 * @param {string} [props.historiaClinicaId] - ID de la historia clínica en contexto
 */
export function OdontogramaViewer({
  odontograma,
  loading = false,
  error = null,
  onRecargar,
  historiaClinicaId = '',
}) {
  const [userSelectedFDI, setUserSelectedFDI] = useState(null);

  // Mapear el arreglo de piezas a un diccionario por numeroFDI para acceso O(1)
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

  // Derivar la pieza activa: si el usuario seleccionó una pieza válida, usarla; si no, la primera pieza disponible
  const selectedNumeroFDI = useMemo(() => {
    if (userSelectedFDI && piezasMap[userSelectedFDI]) {
      return userSelectedFDI;
    }
    if (odontograma?.piezas && odontograma.piezas.length > 0) {
      return odontograma.piezas[0]?.numeroFDI || 11;
    }
    return null;
  }, [userSelectedFDI, piezasMap, odontograma]);

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
            ℹ️ Por protocolo clínico, el odontograma se inicializa de forma explícita durante la apertura o atención de una consulta estomatológica.
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

  const piezaSeleccionada = selectedNumeroFDI ? piezasMap[selectedNumeroFDI] : null;

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

        {onRecargar && (
          <Button variant="secondary" onClick={onRecargar} style={{ fontSize: '12px', padding: '6px 12px' }}>
            🔄 Actualizar Datos
          </Button>
        )}
      </header>

      {/* Distribución anatómica de las 52 posiciones FDI */}
      <ArcadaDental
        piezasMap={piezasMap}
        selectedNumeroFDI={selectedNumeroFDI}
        onSelectPieza={setUserSelectedFDI}
      />

      {/* Panel inferior: Esquema de Superficies y Ficha de Detalle de la Pieza */}
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

        <DetallePiezaDental
          numeroFDI={selectedNumeroFDI}
          pieza={piezaSeleccionada}
        />
      </div>

      {/* Leyenda clínica de apoyo visual */}
      <LeyendaClinica />
    </div>
  );
}
