import { useState } from 'react';
import { useHistoriaClinica } from '../hooks/useHistoriaClinica.js';
import { Card } from '../components/common/Card.jsx';
import { Input } from '../components/common/Input.jsx';
import { Button } from '../components/common/Button.jsx';
import { Alert } from '../components/common/Alert.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { HistoriaClinicaDetail } from '../components/historia-clinica/HistoriaClinicaDetail.jsx';

// Identificadores sintéticos verificados para agilizar pruebas locales
const SUGGESTED_CHIPS = [
  { label: 'Historia E2E 1', tipo: 'ID', valor: 'hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a' },
  { label: 'Paciente E2E 1', tipo: 'PACIENTE', valor: 'pac_e2e_05f25861' },
  { label: 'Historia Inexistente (404)', tipo: 'ID', valor: 'hc_00000000-0000-0000-0000-000000000000' },
  { label: 'Paciente Inexistente (404)', tipo: 'PACIENTE', valor: 'pac_no_existe_en_ms1' },
];

export function ConsultaHistoriaPage({
  onEditarAntecedentes,
  onGestionarClinica,
  onVerConsultas,
  onAbrirConsulta,
  onVerOdontograma,
}) {
  const [tipoBusqueda, setTipoBusqueda] = useState('ID'); // 'ID' | 'PACIENTE'
  const [queryValue, setQueryValue] = useState('');
  const { data, loading, error, buscarPorId, buscarPorPaciente, limpiar } =
    useHistoriaClinica();

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    if (tipoBusqueda === 'ID') {
      void buscarPorId(queryValue);
    } else {
      void buscarPorPaciente(queryValue);
    }
  };

  const handleSelectChip = (chip) => {
    setTipoBusqueda(chip.tipo);
    setQueryValue(chip.valor);
    if (chip.tipo === 'ID') {
      void buscarPorId(chip.valor);
    } else {
      void buscarPorPaciente(chip.valor);
    }
  };

  const handleReset = () => {
    setQueryValue('');
    limpiar();
  };

  return (
    <div>
      <Card title="Búsqueda de Expediente Clínico">
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Criterio de Búsqueda:
          </label>
          <div style={{ display: 'flex', gap: '20px', marginTop: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
              <input
                type="radio"
                name="tipoBusqueda"
                value="ID"
                checked={tipoBusqueda === 'ID'}
                onChange={() => setTipoBusqueda('ID')}
              />
              Por ID de Historia Clínica (ej. <code>hc_...</code>)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
              <input
                type="radio"
                name="tipoBusqueda"
                value="PACIENTE"
                checked={tipoBusqueda === 'PACIENTE'}
                onChange={() => setTipoBusqueda('PACIENTE')}
              />
              Por Identificador del Paciente (ej. <code>pac_...</code>)
            </label>
          </div>
        </div>

        <form onSubmit={handleSearch} className="search-bar-container">
          <Input
            value={queryValue}
            onChange={(e) => setQueryValue(e.target.value)}
            placeholder={
              tipoBusqueda === 'ID'
                ? 'Ingrese el ID canónico (ej. hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a)'
                : 'Ingrese el ID de paciente en MS1 (ej. pac_e2e_05f25861)'
            }
            aria-label="Criterio de búsqueda"
          />

          <Button type="submit" loading={loading} disabled={!queryValue.trim()}>
            Buscar Expediente
          </Button>

          {(data || error || queryValue) && (
            <Button variant="secondary" onClick={handleReset} disabled={loading}>
              Limpiar
            </Button>
          )}
        </form>

        {/* Chips sugeridos de prueba */}
        <div className="quick-chips-container">
          <span>Identificadores sintéticos de prueba:</span>
          {SUGGESTED_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              className="quick-chip"
              onClick={() => handleSelectChip(chip)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Manejo de estados: Carga */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spinner dark />
          <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>
            Consultando expediente clínico en MS2 a través de Nginx...
          </p>
        </div>
      )}

      {/* Manejo de estados: Error con Problem Details */}
      {error && !loading && (
        <Alert
          title={error.title}
          detail={error.detail}
          status={error.status}
          invalidParams={error.invalidParams}
          onClose={limpiar}
        />
      )}

      {/* Manejo de estados: Éxito con detalle */}
      {data && !loading && (
        <HistoriaClinicaDetail
          historia={data}
          onEditarAntecedentes={onEditarAntecedentes}
          onGestionarClinica={onGestionarClinica}
          onVerConsultas={onVerConsultas}
          onAbrirConsulta={onAbrirConsulta}
          onVerOdontograma={onVerOdontograma}
        />
      )}

      {/* Estado vacío inicial */}
      {!data && !error && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Consulte un Expediente Odontológico
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '480px', margin: '0 auto' }}>
            Ingrese el identificador canónico de la historia clínica o el identificador del paciente para visualizar antecedentes, alergias, fármacos y auditoría.
          </p>
        </div>
      )}
    </div>
  );
}
