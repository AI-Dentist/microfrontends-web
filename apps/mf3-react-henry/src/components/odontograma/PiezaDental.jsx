import {
  ESTADO_ANATOMICO,
  ESTADO_EVALUACION,
  CONDICION_SUPERFICIE,
  ETIQUETAS_ESTADO_ANATOMICO,
  ETIQUETAS_ESTADO_EVALUACION,
} from '../../constants/odontograma.constants.js';

/**
 * Representación visual interactiva y accesible de una posición FDI individual.
 *
 * @param {object} props
 * @param {number} props.numeroFDI - Posición anatómica FDI (11..48, 51..85)
 * @param {object} [props.pieza] - PiezaDentalDto proveniente del backend
 * @param {boolean} [props.isSelected=false] - Indica si la pieza está seleccionada
 * @param {Function} props.onSelect - Callback al seleccionar la pieza
 */
export function PiezaDental({ numeroFDI, pieza, isSelected = false, onSelect }) {
  const estadoAnatomico = pieza?.estadoAnatomico || ESTADO_ANATOMICO.DESCONOCIDO;
  const estadoEvaluacion = pieza?.estadoEvaluacion || ESTADO_EVALUACION.NO_EVALUADO;
  const superficies = pieza?.superficies || {};
  const tratamientos = pieza?.tratamientosEstructurales || [];

  // Calcular presencia de patologías o tratamientos en superficies
  const valoresSuperficies = Object.values(superficies);
  const tieneCariesOFractura = valoresSuperficies.some(
    (s) => s.condicion === CONDICION_SUPERFICIE.CARIES || s.condicion === CONDICION_SUPERFICIE.FRACTURA,
  );
  const tieneRestauracion = valoresSuperficies.some(
    (s) =>
      s.condicion === CONDICION_SUPERFICIE.OBTURACION_RESINA ||
      s.condicion === CONDICION_SUPERFICIE.OBTURACION_AMALGAMA ||
      s.condicion === CONDICION_SUPERFICIE.SELLANTE,
  );
  const tieneTratamientoEstructural = tratamientos.length > 0;

  // Clases y etiquetas por estado anatómico
  const estadoClasses = {
    [ESTADO_ANATOMICO.DESCONOCIDO]: 'pieza-estado-desconocido',
    [ESTADO_ANATOMICO.PRESENTE]: 'pieza-estado-presente',
    [ESTADO_ANATOMICO.AUSENTE]: 'pieza-estado-ausente',
    [ESTADO_ANATOMICO.EXTRAIDO]: 'pieza-estado-extraido',
    [ESTADO_ANATOMICO.NO_ERUPCIONADO]: 'pieza-estado-no-erupcionado',
  };

  const getSiglaEstado = (estado) => {
    switch (estado) {
      case ESTADO_ANATOMICO.DESCONOCIDO:
        return '?';
      case ESTADO_ANATOMICO.PRESENTE:
        return 'PRES';
      case ESTADO_ANATOMICO.AUSENTE:
        return 'AUS';
      case ESTADO_ANATOMICO.EXTRAIDO:
        return 'EXT';
      case ESTADO_ANATOMICO.NO_ERUPCIONADO:
        return 'N/E';
      default:
        return '?';
    }
  };

  const handleClick = () => {
    if (onSelect) {
      onSelect(numeroFDI);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const labelAria = `Pieza FDI ${numeroFDI}, Estado anatómico: ${ETIQUETAS_ESTADO_ANATOMICO[estadoAnatomico] || 'Desconocido'}, Evaluación: ${ETIQUETAS_ESTADO_EVALUACION[estadoEvaluacion] || 'No evaluado'}${tieneCariesOFractura ? ', Presenta patología activa' : ''}${tieneRestauracion ? ', Presenta restauración' : ''}${tieneTratamientoEstructural ? ', Con tratamiento estructural' : ''}`;

  return (
    <button
      type="button"
      className={`pieza-dental-btn ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      aria-pressed={isSelected}
      aria-label={labelAria}
      title={labelAria}
      data-fdi={numeroFDI}
    >
      <span className="pieza-numero-fdi">{numeroFDI}</span>

      {/* Mini esquema cruciforme simplificado */}
      <svg
        className="pieza-mini-schema"
        viewBox="0 0 32 32"
        width="32"
        height="32"
        aria-hidden="true"
      >
        <rect x="2" y="2" width="28" height="28" rx="4" fill="none" stroke="var(--border-color)" strokeWidth="1" />
        <line x1="2" y1="2" x2="10" y2="10" stroke="var(--neutral-300)" strokeWidth="1" />
        <line x1="30" y1="2" x2="22" y2="10" stroke="var(--neutral-300)" strokeWidth="1" />
        <line x1="2" y1="30" x2="10" y2="22" stroke="var(--neutral-300)" strokeWidth="1" />
        <line x1="30" y1="30" x2="22" y2="22" stroke="var(--neutral-300)" strokeWidth="1" />
        <rect x="10" y="10" width="12" height="12" fill={tieneCariesOFractura ? 'var(--danger-bg)' : tieneRestauracion ? 'var(--primary-light)' : 'none'} stroke="var(--neutral-300)" strokeWidth="1" />
      </svg>

      {/* Badge de estado anatómico */}
      <span
        className={`pieza-badge-estado ${estadoClasses[estadoAnatomico] || 'pieza-estado-desconocido'}`}
        title={`Estado: ${ETIQUETAS_ESTADO_ANATOMICO[estadoAnatomico] || estadoAnatomico}`}
      >
        {getSiglaEstado(estadoAnatomico)}
      </span>

      {/* Puntos indicadores de hallazgos */}
      <div className="pieza-indicadores-puntos" aria-hidden="true">
        {tieneCariesOFractura && <span className="punto-indicador punto-caries" title="Patología" />}
        {tieneRestauracion && <span className="punto-indicador punto-obturacion" title="Restauración" />}
        {tieneTratamientoEstructural && (
          <span className="punto-indicador punto-tratamiento" title="Tratamiento estructural" />
        )}
      </div>
    </button>
  );
}
