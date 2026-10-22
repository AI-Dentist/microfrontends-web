import { Button } from '../common/Button.jsx';

const ESTADOS_EPISTEMICOS = [
  { value: 'NO_EVALUADO', label: 'No Evaluado' },
  { value: 'NEGADO', label: 'Negado' },
  { value: 'CONFIRMADO', label: 'Confirmado' },
];

const ODONTOLOGICOS_CAMPOS = [
  { key: 'tratamientoPrevio', label: 'Tratamiento Odontológico Previo' },
  { key: 'protesisActual', label: 'Portador de Prótesis Actual' },
  { key: 'sangradoGingival', label: 'Sangrado Gingival al Cepillado' },
  { key: 'bruxismo', label: 'Bruxismo / Apretamiento Dental' },
];

export function AntecedentesForm({
  value,
  onChange,
  disabled = false,
}) {
  const antecedentes = value || {
    antecedentesOdontologicos: {
      tratamientoPrevio: { estado: 'NO_EVALUADO', detalle: '' },
      protesisActual: { estado: 'NO_EVALUADO', detalle: '' },
      sangradoGingival: { estado: 'NO_EVALUADO', detalle: '' },
      bruxismo: { estado: 'NO_EVALUADO', detalle: '' },
    },
    enfermedadesCronicas: [],
    antecedentesMedicos: [],
    antecedentesFamiliares: [],
  };

  const handleOdontologicoChange = (campoKey, field, val) => {
    const prevOdonto = antecedentes.antecedentesOdontologicos || {};
    const prevCampo = prevOdonto[campoKey] || { estado: 'NO_EVALUADO', detalle: '' };
    const updatedCampo = { ...prevCampo, [field]: val };

    // Si cambia de CONFIRMADO a otro, no borra el detalle por si se arrepiente, pero limpia si es necesario
    onChange({
      ...antecedentes,
      antecedentesOdontologicos: {
        ...prevOdonto,
        [campoKey]: updatedCampo,
      },
    });
  };

  const handleArrayItemChange = (arrayKey, index, field, val) => {
    const list = [...(antecedentes[arrayKey] || [])];
    list[index] = { ...list[index], [field]: val };
    onChange({
      ...antecedentes,
      [arrayKey]: list,
    });
  };

  const handleAddArrayItem = (arrayKey, defaultNombre = '') => {
    const list = [...(antecedentes[arrayKey] || [])];
    list.push({
      nombre: defaultNombre,
      estado: 'CONFIRMADO',
      detalle: '',
    });
    onChange({
      ...antecedentes,
      [arrayKey]: list,
    });
  };

  const handleRemoveArrayItem = (arrayKey, index) => {
    const list = [...(antecedentes[arrayKey] || [])];
    list.splice(index, 1);
    onChange({
      ...antecedentes,
      [arrayKey]: list,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Antecedentes Odontológicos */}
      <div>
        <h4 style={{ fontSize: '15px', margin: '0 0 12px', color: 'var(--text-secondary)' }}>
          Antecedentes Odontológicos Básicos
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {ODONTOLOGICOS_CAMPOS.map(({ key, label }) => {
            const campo = antecedentes.antecedentesOdontologicos?.[key] || {
              estado: 'NO_EVALUADO',
              detalle: '',
            };
            const esConfirmado = campo.estado === 'CONFIRMADO';
            const faltaDetalle = esConfirmado && (!campo.detalle || !campo.detalle.trim());

            return (
              <div
                key={key}
                style={{
                  background: 'var(--neutral-50)',
                  border: faltaDetalle ? '1px solid var(--danger)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                  {label}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <select
                    value={campo.estado}
                    disabled={disabled}
                    onChange={(e) => handleOdontologicoChange(key, 'estado', e.target.value)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      flex: 1,
                    }}
                  >
                    {ESTADOS_EPISTEMICOS.map((est) => (
                      <option key={est.value} value={est.value}>
                        {est.label}
                      </option>
                    ))}
                  </select>
                </div>

                {esConfirmado && (
                  <div>
                    <input
                      type="text"
                      placeholder="Detalle clínico requerido (ej. motivo, tratamiento...)"
                      value={campo.detalle || ''}
                      disabled={disabled}
                      onChange={(e) => handleOdontologicoChange(key, 'detalle', e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: faltaDetalle ? '1px solid var(--danger)' : '1px solid var(--border-color)',
                        fontSize: '13px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    {faltaDetalle && (
                      <span style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '2px', display: 'block' }}>
                        * Invariante clínica: El detalle es obligatorio al confirmar el antecedente.
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Enfermedades Crónicas */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ fontSize: '15px', margin: 0, color: 'var(--text-secondary)' }}>
            Enfermedades Crónicas (Diabetes, HTA, Cardiopatías...)
          </h4>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => handleAddArrayItem('enfermedadesCronicas', 'Hipertensión Arterial')}
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            + Añadir Enfermedad Crónica
          </Button>
        </div>

        {(!antecedentes.enfermedadesCronicas || antecedentes.enfermedadesCronicas.length === 0) ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Ninguna enfermedad crónica agregada.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {antecedentes.enfermedadesCronicas.map((item, idx) => (
              <ArrayItemRow
                key={idx}
                item={item}
                index={idx}
                disabled={disabled}
                onChange={(f, val) => handleArrayItemChange('enfermedadesCronicas', idx, f, val)}
                onRemove={() => handleRemoveArrayItem('enfermedadesCronicas', idx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 3. Antecedentes Médicos Quirúrgicos */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ fontSize: '15px', margin: 0, color: 'var(--text-secondary)' }}>
            Antecedentes Médicos / Quirúrgicos
          </h4>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => handleAddArrayItem('antecedentesMedicos', 'Cirugía previa')}
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            + Añadir Antecedente Médico
          </Button>
        </div>

        {(!antecedentes.antecedentesMedicos || antecedentes.antecedentesMedicos.length === 0) ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Ningún antecedente médico quirúrgico agregado.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {antecedentes.antecedentesMedicos.map((item, idx) => (
              <ArrayItemRow
                key={idx}
                item={item}
                index={idx}
                disabled={disabled}
                onChange={(f, val) => handleArrayItemChange('antecedentesMedicos', idx, f, val)}
                onRemove={() => handleRemoveArrayItem('antecedentesMedicos', idx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 4. Antecedentes Familiares */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ fontSize: '15px', margin: 0, color: 'var(--text-secondary)' }}>
            Antecedentes Familiares de Relevancia
          </h4>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => handleAddArrayItem('antecedentesFamiliares', 'Diabetes en familiares')}
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            + Añadir Antecedente Familiar
          </Button>
        </div>

        {(!antecedentes.antecedentesFamiliares || antecedentes.antecedentesFamiliares.length === 0) ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Ningún antecedente familiar agregado.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {antecedentes.antecedentesFamiliares.map((item, idx) => (
              <ArrayItemRow
                key={idx}
                item={item}
                index={idx}
                disabled={disabled}
                onChange={(f, val) => handleArrayItemChange('antecedentesFamiliares', idx, f, val)}
                onRemove={() => handleRemoveArrayItem('antecedentesFamiliares', idx)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArrayItemRow({ item, disabled, onChange, onRemove }) {
  const esConfirmado = item.estado === 'CONFIRMADO';
  const faltaDetalle = esConfirmado && (!item.detalle || !item.detalle.trim());

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 1fr) 140px minmax(200px, 2fr) 40px',
        gap: '10px',
        alignItems: 'start',
        background: 'var(--neutral-50)',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        border: faltaDetalle ? '1px solid var(--danger)' : '1px solid var(--border-color)',
      }}
    >
      <input
        type="text"
        placeholder="Nombre condición / patología"
        value={item.nombre || ''}
        disabled={disabled}
        onChange={(e) => onChange('nombre', e.target.value)}
        style={{
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          fontSize: '13px',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
        }}
      />

      <select
        value={item.estado || 'NO_EVALUADO'}
        disabled={disabled}
        onChange={(e) => onChange('estado', e.target.value)}
        style={{
          padding: '6px 8px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          fontSize: '13px',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
        }}
      >
        {ESTADOS_EPISTEMICOS.map((est) => (
          <option key={est.value} value={est.value}>
            {est.label}
          </option>
        ))}
      </select>

      <div>
        <input
          type="text"
          placeholder={esConfirmado ? 'Detalle clínico obligatorio' : 'Observación opcional'}
          value={item.detalle || ''}
          disabled={disabled}
          onChange={(e) => onChange('detalle', e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: faltaDetalle ? '1px solid var(--danger)' : '1px solid var(--border-color)',
            fontSize: '13px',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          }}
        />
        {faltaDetalle && (
          <span style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '2px', display: 'block' }}>
            * Detalle obligatorio al estar confirmado.
          </span>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        title="Eliminar elemento"
        style={{
          background: 'var(--danger-bg)',
          color: 'var(--danger)',
          border: '1px solid var(--danger-border)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          padding: '6px',
          fontSize: '13px',
          fontWeight: 'bold',
        }}
      >
        ✕
      </button>
    </div>
  );
}
