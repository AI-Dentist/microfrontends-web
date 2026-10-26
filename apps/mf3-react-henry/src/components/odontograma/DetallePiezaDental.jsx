import {
  ETIQUETAS_ESTADO_ANATOMICO,
  ETIQUETAS_ESTADO_EVALUACION,
  ETIQUETAS_SUPERFICIE,
  ETIQUETAS_CONDICION_SUPERFICIE,
  ETIQUETAS_TRATAMIENTO_ESTRUCTURAL,
  TIPO_SUPERFICIE,
  esDenticionPermanente,
  obtenerCuadranteFDI,
} from '../../constants/odontograma.constants.js';
import { obtenerDescripcionPiezaFDI } from '../../utils/fdi-validator.js';
import { Badge } from '../common/Badge.jsx';

/**
 * Panel de detalle clínico y superficies para la pieza dental seleccionada.
 *
 * @param {object} props
 * @param {number|null} props.numeroFDI - Número FDI seleccionado
 * @param {object|null} props.pieza - PiezaDentalDto proveniente del backend
 */
export function DetallePiezaDental({ numeroFDI, pieza }) {
  if (!numeroFDI) {
    return (
      <div className="detalle-ficha" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '260px' }}>
        <span style={{ fontSize: '32px', marginBottom: '8px' }}>🦷</span>
        <h4 style={{ margin: '0 0 4px', color: 'var(--text-secondary)' }}>Ninguna Pieza Seleccionada</h4>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '320px' }}>
          Haga clic o navegue con el teclado hacia cualquier posición dental FDI en el esquema superior para examinar su estado clínico y superficies.
        </p>
      </div>
    );
  }

  const esPermanente = esDenticionPermanente(numeroFDI);
  const cuadrante = obtenerCuadranteFDI(numeroFDI);
  const descripcionAnatomica = obtenerDescripcionPiezaFDI(numeroFDI);

  const estadoAnatomico = pieza?.estadoAnatomico || 'DESCONOCIDO';
  const estadoEvaluacion = pieza?.estadoEvaluacion || 'NO_EVALUADO';
  const superficies = pieza?.superficies || {};
  const tratamientos = pieza?.tratamientosEstructurales || [];
  const observaciones = pieza?.observaciones || null;

  // Lista ordenada de superficies estándar
  const listaSuperficies = [
    TIPO_SUPERFICIE.VESTIBULAR,
    TIPO_SUPERFICIE.PALATINA_LINGUAL,
    TIPO_SUPERFICIE.MESIAL,
    TIPO_SUPERFICIE.DISTAL,
    TIPO_SUPERFICIE.OCLUSAL_INCISAL,
  ];

  return (
    <div className="detalle-ficha" aria-live="polite">
      <div className="detalle-ficha-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 className="detalle-ficha-title">
              Pieza FDI {numeroFDI}
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {descripcionAnatomica}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <Badge variant={esPermanente ? 'primary' : 'info'}>
              {esPermanente ? 'Dentición Permanente' : 'Dentición Temporal'}
            </Badge>
            <Badge variant="secondary">Cuadrante {cuadrante}</Badge>
          </div>
        </div>
      </div>

      {/* Estados clínicos generales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
            Estado Anatómico:
          </span>
          <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
            {ETIQUETAS_ESTADO_ANATOMICO[estadoAnatomico] || estadoAnatomico}
          </strong>
        </div>

        <div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
            Evaluación Clínica:
          </span>
          <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
            {ETIQUETAS_ESTADO_EVALUACION[estadoEvaluacion] || estadoEvaluacion}
          </strong>
        </div>
      </div>

      {/* Tabla detallada de superficies anatómicas */}
      <div>
        <h4 style={{ margin: '8px 0 6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Condición por Superficie Anatómica:
        </h4>

        <table className="superficies-table">
          <thead>
            <tr>
              <th>Superficie</th>
              <th>Condición Registrada</th>
              <th>Inspeccionada</th>
            </tr>
          </thead>
          <tbody>
            {listaSuperficies.map((supKey) => {
              const supData = superficies[supKey] || { condicion: 'NO_EVALUADA', evaluada: false };
              return (
                <tr key={supKey}>
                  <td>
                    <strong>{ETIQUETAS_SUPERFICIE[supKey] || supKey}</strong>
                  </td>
                  <td>
                    <span className={`condicion-text condicion-${supData.condicion}`}>
                      {ETIQUETAS_CONDICION_SUPERFICIE[supData.condicion] || supData.condicion || 'No evaluada'}
                    </span>
                  </td>
                  <td>
                    {supData.evaluada ? (
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Sí</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>— No</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tratamientos estructurales */}
      <div>
        <h4 style={{ margin: '8px 0 6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Tratamientos Estructurales o Protésicos:
        </h4>
        {tratamientos.length === 0 ? (
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
            Sin tratamientos estructurales registrados (pieza sin perno, corona, endodoncia ni implante).
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
            {tratamientos.map((t, idx) => (
              <li key={idx} style={{ marginBottom: '4px' }}>
                <strong>{ETIQUETAS_TRATAMIENTO_ESTRUCTURAL[t.tipo] || t.tipo}</strong>
                {t.fechaRegistro && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                    (Registrado el: {new Date(t.fechaRegistro).toLocaleDateString()})
                  </span>
                )}
                {t.consultaId && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                    [Consulta: <code>{t.consultaId}</code>]
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Observaciones clínicas */}
      {observaciones && (
        <div style={{ backgroundColor: 'var(--neutral-100)', padding: '10px 14px', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
            Observaciones Clínicas de la Pieza:
          </span>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)' }}>
            {observaciones}
          </p>
        </div>
      )}

      {/* Nota de pie */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
        ℹ️ Modo de visualización clínica (solo lectura). No se realizan mutaciones sobre la base de datos clínica.
      </div>
    </div>
  );
}
