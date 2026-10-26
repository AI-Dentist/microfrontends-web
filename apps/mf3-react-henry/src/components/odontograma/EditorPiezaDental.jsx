import {
  ESTADO_ANATOMICO,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
  TIPO_TRATAMIENTO_ESTRUCTURAL,
  ETIQUETAS_ESTADO_ANATOMICO,
  ETIQUETAS_CONDICION_SUPERFICIE,
  ETIQUETAS_SUPERFICIE,
  ETIQUETAS_TRATAMIENTO_ESTRUCTURAL,
} from '../../constants/odontograma.constants.js';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';

const SUPERFICIES_LIST = [
  TIPO_SUPERFICIE.VESTIBULAR,
  TIPO_SUPERFICIE.PALATINA_LINGUAL,
  TIPO_SUPERFICIE.MESIAL,
  TIPO_SUPERFICIE.DISTAL,
  TIPO_SUPERFICIE.OCLUSAL_INCISAL,
];

/**
 * Controles de edición clínica en memoria para la pieza dental seleccionada.
 *
 * @param {object} props
 * @param {number} props.numeroFDI - Número FDI seleccionado
 * @param {object} props.piezaOriginal - Estado de la pieza en el snapshot original
 * @param {object} props.piezaBorrador - Estado actual en el borrador de trabajo
 * @param {boolean} props.tieneCambios - Indica si esta pieza tiene modificaciones respecto al original
 * @param {Function} props.onActualizar - Callback (cambiosParciales) => void
 * @param {Function} props.onDescartar - Callback para revertir esta pieza
 */
export function EditorPiezaDental({
  numeroFDI,
  piezaOriginal,
  piezaBorrador,
  tieneCambios = false,
  onActualizar,
  onDescartar,
}) {
  if (!numeroFDI || !piezaOriginal) {
    return (
      <div className="detalle-ficha" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Seleccione una pieza dental para preparar modificaciones clínicas.
        </p>
      </div>
    );
  }

  const estadoAnatomico = piezaBorrador?.estadoAnatomico || ESTADO_ANATOMICO.DESCONOCIDO;
  const superficies = piezaBorrador?.superficies || {};
  const tratamientoAgregado = piezaBorrador?.tratamientoEstructuralAgregado || '';
  const observaciones = piezaBorrador?.observaciones || '';

  const esPresente = estadoAnatomico === ESTADO_ANATOMICO.PRESENTE;
  const posicion = Number(numeroFDI) % 10;
  const esAnterior = posicion <= 3;

  const handleCambioEstadoAnatomico = (e) => {
    const nuevoEstado = e.target.value;
    onActualizar({ estadoAnatomico: nuevoEstado });
  };

  const handleCambioSuperficie = (supKey, e) => {
    const nuevaCondicion = e.target.value;
    onActualizar({
      superficies: {
        [supKey]: {
          superficie: supKey,
          condicion: nuevaCondicion,
          evaluada: nuevaCondicion !== CONDICION_SUPERFICIE.NO_EVALUADA,
        },
      },
    });
  };

  const handleCambioTratamiento = (e) => {
    const valor = e.target.value || null;
    onActualizar({ tratamientoEstructuralAgregado: valor });
  };

  const handleCambioObservaciones = (e) => {
    onActualizar({ observaciones: e.target.value });
  };

  return (
    <div className="detalle-ficha editor-ficha" aria-label="Editor de pieza dental">
      <div className="detalle-ficha-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 className="detalle-ficha-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✏️ Editar Pieza FDI {numeroFDI}</span>
              {tieneCambios && <Badge variant="warning">Modificada en borrador</Badge>}
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Modificaciones clínicas locales no persistidas en el servidor.
            </span>
          </div>

          {tieneCambios && (
            <Button
              variant="secondary"
              onClick={onDescartar}
              style={{ fontSize: '12px', padding: '4px 10px' }}
              title="Descartar los cambios preparados sobre esta pieza y volver a su valor original"
            >
              ↩️ Descartar Cambios de Pieza
            </Button>
          )}
        </div>
      </div>

      {/* Control 1: Estado Anatómico */}
      <div className="editor-control-group">
        <label htmlFor="editor-estado-anatomico" className="editor-label">
          Estado Anatómico:
        </label>
        <select
          id="editor-estado-anatomico"
          value={estadoAnatomico}
          onChange={handleCambioEstadoAnatomico}
          className="editor-select"
        >
          {Object.values(ESTADO_ANATOMICO).map((estado) => (
            <option key={estado} value={estado}>
              {ETIQUETAS_ESTADO_ANATOMICO[estado] || estado}
            </option>
          ))}
        </select>
        {!esPresente && (
          <span style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '4px', display: 'block' }}>
            ⚠️ Al no estar PRESENTE, las superficies se mantienen en NO_EVALUADA conforme a las reglas clínicas del dominio.
          </span>
        )}
      </div>

      {/* Control 2: Condiciones por Superficie */}
      <div className="editor-control-group">
        <label className="editor-label">
          Condiciones por Superficie Anatómica:
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {SUPERFICIES_LIST.map((supKey) => {
            const condActual = superficies[supKey]?.condicion || CONDICION_SUPERFICIE.NO_EVALUADA;
            const esIncisalAnterior = esAnterior && supKey === TIPO_SUPERFICIE.OCLUSAL_INCISAL;

            return (
              <div key={supKey} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {ETIQUETAS_SUPERFICIE[supKey]}
                </span>
                <select
                  value={condActual}
                  onChange={(e) => handleCambioSuperficie(supKey, e)}
                  disabled={!esPresente}
                  className="editor-select"
                  style={{ fontSize: '12px', padding: '6px 8px' }}
                >
                  {Object.values(CONDICION_SUPERFICIE).map((cond) => {
                    // INV-ODO-04: Dientes anteriores no admiten SELLANTE en incisal
                    if (cond === CONDICION_SUPERFICIE.SELLANTE && esIncisalAnterior) {
                      return null;
                    }
                    return (
                      <option key={cond} value={cond}>
                        {ETIQUETAS_CONDICION_SUPERFICIE[cond] || cond}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Control 3: Incorporación de Tratamiento Estructural */}
      <div className="editor-control-group">
        <label htmlFor="editor-tratamiento-estructural" className="editor-label">
          Agregar Tratamiento Estructural o Protésico:
        </label>
        <select
          id="editor-tratamiento-estructural"
          value={tratamientoAgregado}
          onChange={handleCambioTratamiento}
          className="editor-select"
        >
          <option value="">— Sin nuevo tratamiento estructural —</option>
          {Object.values(TIPO_TRATAMIENTO_ESTRUCTURAL).map((tipo) => (
            <option key={tipo} value={tipo}>
              ➕ {ETIQUETAS_TRATAMIENTO_ESTRUCTURAL[tipo] || tipo}
            </option>
          ))}
        </select>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
          Permite preparar coronas, endodoncias, pernos o implantes para incluir en la próxima revisión clínica.
        </span>
      </div>

      {/* Control 4: Observaciones cualitativas */}
      <div className="editor-control-group">
        <label htmlFor="editor-observaciones" className="editor-label">
          Observaciones Clínicas de la Pieza (Máx. 500 caracteres):
        </label>
        <textarea
          id="editor-observaciones"
          value={observaciones}
          onChange={handleCambioObservaciones}
          maxLength={500}
          rows={3}
          placeholder="Ej: Aislamiento absoluto con grapa #14. Restauración estética proximal."
          className="editor-textarea"
        />
        <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)' }}>
          {observaciones.length} / 500 caracteres
        </div>
      </div>
    </div>
  );
}
