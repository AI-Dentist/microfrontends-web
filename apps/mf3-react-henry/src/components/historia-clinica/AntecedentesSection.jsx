import { Badge } from '../common/Badge.jsx';

function CampoClinicoItem({ label, campo }) {
  if (!campo) return null;

  const estado = campo.estado || 'NO_EVALUADO';
  const nombre = campo.nombre || label;

  return (
    <div className="antecedente-card">
      <div className="antecedente-card-title">
        <span>{nombre}</span>
        <Badge variant={estado}>{estado.replace('_', ' ')}</Badge>
      </div>
      {campo.detalle && (
        <div className="antecedente-card-detail">
          <strong>Detalle:</strong> {campo.detalle}
        </div>
      )}
      {campo.registradoEn && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Registrado: {new Date(campo.registradoEn).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

export function AntecedentesSection({ antecedentes }) {
  if (!antecedentes) {
    return <p style={{ color: 'var(--text-muted)' }}>Sin antecedentes registrados.</p>;
  }

  const {
    enfermedadesCronicas = [],
    antecedentesMedicos = [],
    antecedentesFamiliares = [],
    antecedentesOdontologicos = {},
  } = antecedentes;

  const odontologicosKeys = [
    { key: 'tratamientoPrevio', label: 'Tratamiento Previo' },
    { key: 'protesisActual', label: 'Prótesis Actual' },
    { key: 'sangradoGingival', label: 'Sangrado Gingival' },
    { key: 'bruxismo', label: 'Bruxismo' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Antecedentes Odontológicos Específicos */}
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px', color: 'var(--text-secondary)' }}>
          Antecedentes Odontológicos
        </h3>
        <div className="antecedentes-grid">
          {odontologicosKeys.map(({ key, label }) => {
            const campo = antecedentesOdontologicos[key];
            return campo ? (
              <CampoClinicoItem key={key} label={label} campo={campo} />
            ) : null;
          })}
        </div>
      </div>

      {/* Enfermedades Crónicas */}
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px', color: 'var(--text-secondary)' }}>
          Enfermedades Crónicas ({enfermedadesCronicas.length})
        </h3>
        {enfermedadesCronicas.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            No se han registrado enfermedades crónicas.
          </p>
        ) : (
          <div className="antecedentes-grid">
            {enfermedadesCronicas.map((item, idx) => (
              <CampoClinicoItem key={idx} label={`Condición ${idx + 1}`} campo={item} />
            ))}
          </div>
        )}
      </div>

      {/* Antecedentes Médicos Generales */}
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px', color: 'var(--text-secondary)' }}>
          Antecedentes Médicos Quirúrgicos ({antecedentesMedicos.length})
        </h3>
        {antecedentesMedicos.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            No se han reportado antecedentes médicos quirúrgicos.
          </p>
        ) : (
          <div className="antecedentes-grid">
            {antecedentesMedicos.map((item, idx) => (
              <CampoClinicoItem key={idx} label={`Antecedente ${idx + 1}`} campo={item} />
            ))}
          </div>
        )}
      </div>

      {/* Antecedentes Familiares */}
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px', color: 'var(--text-secondary)' }}>
          Antecedentes Familiares ({antecedentesFamiliares.length})
        </h3>
        {antecedentesFamiliares.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            No se han reportado antecedentes familiares de relevancia.
          </p>
        ) : (
          <div className="antecedentes-grid">
            {antecedentesFamiliares.map((item, idx) => (
              <CampoClinicoItem key={idx} label={`Familiar ${idx + 1}`} campo={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
