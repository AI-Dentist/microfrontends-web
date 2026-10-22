import { useState, useEffect, useCallback } from 'react';
import { historiasClinicasService } from '../api/historias-clinicas.service.js';
import { useDevAuth } from '../hooks/useDevAuth.js';
import { Card } from '../components/common/Card.jsx';
import { Input } from '../components/common/Input.jsx';
import { Button } from '../components/common/Button.jsx';
import { Alert } from '../components/common/Alert.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { EstadoBadge } from '../components/historia-clinica/EstadoBadge.jsx';
import { AlergiasManager } from '../components/historia-clinica/AlergiasManager.jsx';
import { MedicamentosManager } from '../components/historia-clinica/MedicamentosManager.jsx';
import { EstadoManager } from '../components/historia-clinica/EstadoManager.jsx';

const SUGGESTED_CHIPS = [
  { label: 'Historia E2E 1', valor: 'hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a' },
  { label: 'Historia Inexistente (404)', valor: 'hc_00000000-0000-0000-0000-000000000000' },
];

export function GestionClinicaPage({ initialHistoriaId, initialSubtab = 'alergias' }) {
  const { token } = useDevAuth();

  const [searchId, setSearchId] = useState(initialHistoriaId || '');
  const [activeSubtab, setActiveSubtab] = useState(initialSubtab); // 'alergias' | 'medicamentos' | 'estado'

  const [historia, setHistoria] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);

  const cargarExpediente = useCallback(
    async (idAUsar) => {
      const id = (idAUsar !== undefined ? idAUsar : searchId)?.trim();
      if (!id) {
        setErrorCarga({
          title: 'ID Requerido',
          detail: 'Ingrese el ID canónico de la historia clínica para gestionar alergias, fármacos o estado.',
        });
        return;
      }

      setLoading(true);
      setErrorCarga(null);

      try {
        const data = await historiasClinicasService.getById(id, token);
        setHistoria(data);
      } catch (err) {
        setErrorCarga(err);
        setHistoria(null);
      } finally {
        setLoading(false);
      }
    },
    [searchId, token],
  );

  useEffect(() => {
    if (!initialHistoriaId) return;

    let isMounted = true;
    const fetchInitial = async () => {
      setLoading(true);
      setErrorCarga(null);
      try {
        const data = await historiasClinicasService.getById(initialHistoriaId.trim(), token);
        if (isMounted) {
          setHistoria(data);
        }
      } catch (err) {
        if (isMounted) {
          setErrorCarga(err);
          setHistoria(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void fetchInitial();

    return () => {
      isMounted = false;
    };
  }, [initialHistoriaId, token]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    void cargarExpediente();
  };

  const handleSelectChip = (chipValor) => {
    setSearchId(chipValor);
    void cargarExpediente(chipValor);
  };

  const handleActualizacionExitosa = (historiaActualizada) => {
    setHistoria(historiaActualizada);
  };

  const handleRecargar = () => {
    if (historia?.id) {
      void cargarExpediente(historia.id);
    } else {
      void cargarExpediente();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Barra de Búsqueda y Carga */}
      <Card title="Gestión Clínica de Expediente (Alergias, Fármacos y Estado)">
        <form onSubmit={handleSearchSubmit} className="search-bar-container">
          <Input
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Ingrese el ID canónico (ej. hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a)"
            aria-label="Identificador de historia clínica"
          />
          <Button type="submit" loading={loading} disabled={!searchId.trim()}>
            Cargar Expediente
          </Button>
          {historia && (
            <Button variant="secondary" onClick={handleRecargar} disabled={loading}>
              🔄 Recargar
            </Button>
          )}
        </form>

        <div className="quick-chips-container">
          <span>Identificadores sintéticos de prueba:</span>
          {SUGGESTED_CHIPS.map((chip, idx) => (
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

      {/* Spinner de carga */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '36px 0' }}>
          <Spinner dark />
          <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>
            Consultando expediente clínico en MS2...
          </p>
        </div>
      )}

      {/* Error de Carga con Problem Details */}
      {errorCarga && !loading && (
        <Alert
          title={errorCarga.title}
          detail={errorCarga.detail}
          status={errorCarga.status}
          invalidParams={errorCarga.invalidParams}
          onClose={() => setErrorCarga(null)}
        />
      )}

      {/* Expediente Cargado */}
      {historia && !loading && (
        <>
          {/* Resumen del Expediente */}
          <Card>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '22px' }}>📋</span>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                    <code>{historia.id}</code>
                  </h3>
                  <EstadoBadge estado={historia.estado} />
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Paciente: <strong>{historia.pacienteId}</strong> | Odontólogo:{' '}
                  <strong>{historia.odontologoResponsableId}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    background: 'var(--primary-light)',
                    color: 'var(--primary-dark)',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                  }}
                >
                  Concurrencia: v{historia.version}
                </span>
              </div>
            </div>
          </Card>

          {/* Sub-navegación por pestañas secundarias */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '2px solid var(--border-color)',
              paddingBottom: '4px',
            }}
          >
            <button
              type="button"
              className={`nav-tab-btn ${activeSubtab === 'alergias' ? 'active' : ''}`}
              onClick={() => setActiveSubtab('alergias')}
              style={{ padding: '8px 16px', fontSize: '14px' }}
            >
              <span>⚠️</span>
              <span>Alergias ({historia.alergias?.length || 0})</span>
            </button>

            <button
              type="button"
              className={`nav-tab-btn ${activeSubtab === 'medicamentos' ? 'active' : ''}`}
              onClick={() => setActiveSubtab('medicamentos')}
              style={{ padding: '8px 16px', fontSize: '14px' }}
            >
              <span>💊</span>
              <span>Medicamentos ({historia.medicamentosActuales?.length || 0})</span>
            </button>

            <button
              type="button"
              className={`nav-tab-btn ${activeSubtab === 'estado' ? 'active' : ''}`}
              onClick={() => setActiveSubtab('estado')}
              style={{ padding: '8px 16px', fontSize: '14px' }}
            >
              <span>🔄</span>
              <span>Cambiar Estado ({historia.estado})</span>
            </button>
          </div>

          {/* Contenido de la Sub-Pestaña Activa */}
          {activeSubtab === 'alergias' && (
            <AlergiasManager
              key={`${historia.id}-v${historia.version}-alergias`}
              historia={historia}
              onAlergiasActualizadas={handleActualizacionExitosa}
              onRecargarExpediente={handleRecargar}
            />
          )}

          {activeSubtab === 'medicamentos' && (
            <MedicamentosManager
              key={`${historia.id}-v${historia.version}-medicamentos`}
              historia={historia}
              onMedicamentosActualizados={handleActualizacionExitosa}
              onRecargarExpediente={handleRecargar}
            />
          )}

          {activeSubtab === 'estado' && (
            <EstadoManager
              key={`${historia.id}-v${historia.version}-estado`}
              historia={historia}
              onEstadoCambiado={handleActualizacionExitosa}
              onRecargarExpediente={handleRecargar}
            />
          )}
        </>
      )}

      {/* Estado vacío inicial */}
      {!historia && !loading && !errorCarga && (
        <div className="empty-state">
          <div className="empty-state-icon">💊</div>
          <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Seleccione o busque una Historia Clínica
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '480px', margin: '0 auto' }}>
            Ingrese el identificador canónico del expediente clínico para registrar alergias, administrar medicamentos habituales o actualizar su estado operativo.
          </p>
        </div>
      )}
    </div>
  );
}
