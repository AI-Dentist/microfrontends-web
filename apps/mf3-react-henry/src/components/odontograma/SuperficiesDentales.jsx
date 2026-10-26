import {
  TIPO_SUPERFICIE,
  CONDICION_SUPERFICIE,
  ETIQUETAS_SUPERFICIE,
  ETIQUETAS_CONDICION_SUPERFICIE,
  obtenerCuadranteFDI,
} from '../../constants/odontograma.constants.js';

/**
 * Esquema anatómico visual en SVG de las 5 superficies de una pieza dental seleccionada.
 *
 * Disposición anatómica:
 * - Superior: Vestibular (V)
 * - Centro: Oclusal / Incisal (O/I)
 * - Inferior: Palatina o Lingual (P/L)
 * - Lados: Mesial (M) orientada hacia la línea media y Distal (D) orientada hacia posterior.
 *
 * @param {object} props
 * @param {number} props.numeroFDI - Número FDI de la pieza para determinar orientación anatómica
 * @param {Record<string, { superficie: string, condicion: string, evaluada: boolean }>} props.superficies - Mapa de superficies
 */
export function SuperficiesDentales({ numeroFDI, superficies = {} }) {
  const cuadrante = obtenerCuadranteFDI(numeroFDI);

  // En cuadrantes derechos (1, 4, 5, 8), la línea media dental se encuentra a la derecha de la pieza.
  // Por tanto: Mesial (hacia línea media) está a la derecha del esquema, y Distal a la izquierda.
  // En cuadrantes izquierdos (2, 3, 6, 7), la línea media está a la izquierda.
  // Por tanto: Mesial está a la izquierda del esquema, y Distal a la derecha.
  const esLadoDerechoPaciente = cuadrante === 1 || cuadrante === 4 || cuadrante === 5 || cuadrante === 8;

  const supVestibular = superficies[TIPO_SUPERFICIE.VESTIBULAR] || {
    superficie: TIPO_SUPERFICIE.VESTIBULAR,
    condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
    evaluada: false,
  };

  const supPalatinaLingual = superficies[TIPO_SUPERFICIE.PALATINA_LINGUAL] || {
    superficie: TIPO_SUPERFICIE.PALATINA_LINGUAL,
    condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
    evaluada: false,
  };

  const supOclusal = superficies[TIPO_SUPERFICIE.OCLUSAL_INCISAL] || {
    superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL,
    condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
    evaluada: false,
  };

  const supMesial = superficies[TIPO_SUPERFICIE.MESIAL] || {
    superficie: TIPO_SUPERFICIE.MESIAL,
    condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
    evaluada: false,
  };

  const supDistal = superficies[TIPO_SUPERFICIE.DISTAL] || {
    superficie: TIPO_SUPERFICIE.DISTAL,
    condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
    evaluada: false,
  };

  // Asignar sectores laterales
  const supIzquierda = esLadoDerechoPaciente ? supDistal : supMesial;
  const letraIzquierda = esLadoDerechoPaciente ? 'D' : 'M';
  const nombreIzquierda = esLadoDerechoPaciente ? 'Distal (D)' : 'Mesial (M)';

  const supDerecha = esLadoDerechoPaciente ? supMesial : supDistal;
  const letraDerecha = esLadoDerechoPaciente ? 'M' : 'D';
  const nombreDerecha = esLadoDerechoPaciente ? 'Mesial (M)' : 'Distal (D)';

  const getCondicionClass = (condicion) => {
    return `condicion-${condicion || CONDICION_SUPERFICIE.NO_EVALUADA}`;
  };

  return (
    <div className="superficies-card">
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <h4 style={{ margin: '0 0 4px', fontSize: '14px', color: 'var(--text-primary)' }}>
          Esquema Anatómico de Superficies
        </h4>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Pieza {numeroFDI} {esLadoDerechoPaciente ? '(Lado Derecho del Paciente)' : '(Lado Izquierdo del Paciente)'}
        </span>
      </div>

      <div className="superficies-svg-container">
        <svg
          viewBox="0 0 200 200"
          width="100%"
          height="100%"
          role="img"
          aria-label={`Esquema de las 5 superficies dentales de la pieza ${numeroFDI}`}
        >
          {/* Superficie Superior: VESTIBULAR */}
          <polygon
            points="20,20 180,20 140,60 60,60"
            className={`superficie-sector ${getCondicionClass(supVestibular.condicion)}`}
            aria-label={`${ETIQUETAS_SUPERFICIE[TIPO_SUPERFICIE.VESTIBULAR]}: ${ETIQUETAS_CONDICION_SUPERFICIE[supVestibular.condicion] || 'No evaluada'}`}
          >
            <title>{`${ETIQUETAS_SUPERFICIE[TIPO_SUPERFICIE.VESTIBULAR]}: ${ETIQUETAS_CONDICION_SUPERFICIE[supVestibular.condicion] || 'No evaluada'}`}</title>
          </polygon>
          <text x="100" y="42" className="superficie-text">
            V
          </text>

          {/* Superficie Izquierda: Mesial o Distal según cuadrante */}
          <polygon
            points="20,20 60,60 60,140 20,180"
            className={`superficie-sector ${getCondicionClass(supIzquierda.condicion)}`}
            aria-label={`${nombreIzquierda}: ${ETIQUETAS_CONDICION_SUPERFICIE[supIzquierda.condicion] || 'No evaluada'}`}
          >
            <title>{`${nombreIzquierda}: ${ETIQUETAS_CONDICION_SUPERFICIE[supIzquierda.condicion] || 'No evaluada'}`}</title>
          </polygon>
          <text x="40" y="100" className="superficie-text">
            {letraIzquierda}
          </text>

          {/* Superficie Central: OCLUSAL / INCISAL */}
          <polygon
            points="60,60 140,60 140,140 60,140"
            className={`superficie-sector ${getCondicionClass(supOclusal.condicion)}`}
            aria-label={`${ETIQUETAS_SUPERFICIE[TIPO_SUPERFICIE.OCLUSAL_INCISAL]}: ${ETIQUETAS_CONDICION_SUPERFICIE[supOclusal.condicion] || 'No evaluada'}`}
          >
            <title>{`${ETIQUETAS_SUPERFICIE[TIPO_SUPERFICIE.OCLUSAL_INCISAL]}: ${ETIQUETAS_CONDICION_SUPERFICIE[supOclusal.condicion] || 'No evaluada'}`}</title>
          </polygon>
          <text x="100" y="100" className="superficie-text">
            O/I
          </text>

          {/* Superficie Derecha: Mesial o Distal según cuadrante */}
          <polygon
            points="180,20 180,180 140,140 140,60"
            className={`superficie-sector ${getCondicionClass(supDerecha.condicion)}`}
            aria-label={`${nombreDerecha}: ${ETIQUETAS_CONDICION_SUPERFICIE[supDerecha.condicion] || 'No evaluada'}`}
          >
            <title>{`${nombreDerecha}: ${ETIQUETAS_CONDICION_SUPERFICIE[supDerecha.condicion] || 'No evaluada'}`}</title>
          </polygon>
          <text x="160" y="100" className="superficie-text">
            {letraDerecha}
          </text>

          {/* Superficie Inferior: PALATINA / LINGUAL */}
          <polygon
            points="60,140 140,140 180,180 20,180"
            className={`superficie-sector ${getCondicionClass(supPalatinaLingual.condicion)}`}
            aria-label={`${ETIQUETAS_SUPERFICIE[TIPO_SUPERFICIE.PALATINA_LINGUAL]}: ${ETIQUETAS_CONDICION_SUPERFICIE[supPalatinaLingual.condicion] || 'No evaluada'}`}
          >
            <title>{`${ETIQUETAS_SUPERFICIE[TIPO_SUPERFICIE.PALATINA_LINGUAL]}: ${ETIQUETAS_CONDICION_SUPERFICIE[supPalatinaLingual.condicion] || 'No evaluada'}`}</title>
          </polygon>
          <text x="100" y="160" className="superficie-text">
            P/L
          </text>
        </svg>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
        <strong>Orientación Anatómica:</strong>
        <br />
        Mesial (M) orientada hacia la línea media dental (
        {esLadoDerechoPaciente ? 'hacia la derecha' : 'hacia la izquierda'}).
        <br />
        Distal (D) orientada en sentido opuesto.
      </div>
    </div>
  );
}
