/**
 * View-Model y funciones de presentación clínica para el Odontograma (Iteración 7F-2).
 *
 * Desacopla la lógica de distribución anatómica, orientación de superficies,
 * accesibilidad y resumen clínico para garantizar una arquitectura modular y testeable.
 */

import {
  ESTADO_ANATOMICO,
  ESTADO_EVALUACION,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
  ETIQUETAS_ESTADO_ANATOMICO,
  ETIQUETAS_ESTADO_EVALUACION,
  ETIQUETAS_SUPERFICIE,
  ETIQUETAS_CONDICION_SUPERFICIE,
  ETIQUETAS_TRATAMIENTO_ESTRUCTURAL,
  AGRUPACION_CUADRANTES_FDI,
  esNumeroFDIValido,
  esDenticionPermanente,
  esDenticionTemporal,
  obtenerCuadranteFDI,
} from '../constants/odontograma.constants.js';
import { obtenerDescripcionPiezaFDI } from './fdi-validator.js';

/**
 * Organiza las 52 posiciones FDI en las 4 secciones anatómicas de arcadas.
 *
 * @param {Record<number, object>} [piezasMap={}] - Diccionario de piezas indexado por numeroFDI
 * @returns {Array<{ id: string, titulo: string, tipo: string, cuadrantes: Array<object> }>}
 */
export function construirEstructuraArcadas(piezasMap = {}) {
  const {
    cuadrante1,
    cuadrante2,
    cuadrante3,
    cuadrante4,
    cuadrante5,
    cuadrante6,
    cuadrante7,
    cuadrante8,
  } = AGRUPACION_CUADRANTES_FDI;

  return [
    {
      id: 'maxilar-permanente',
      titulo: 'Maxilar Superior — Dentición Permanente (32 posiciones)',
      tipo: 'PERMANENTE',
      arcada: 'SUPERIOR',
      ladoDerecho: {
        cuadrante: 1,
        etiqueta: 'Cuadrante 1 (Superior Derecho)',
        piezas: cuadrante1.piezas.map((fdi) => ({
          numeroFDI: fdi,
          pieza: piezasMap[fdi] || null,
        })),
      },
      ladoIzquierdo: {
        cuadrante: 2,
        etiqueta: 'Cuadrante 2 (Superior Izquierdo)',
        piezas: cuadrante2.piezas.map((fdi) => ({
          numeroFDI: fdi,
          pieza: piezasMap[fdi] || null,
        })),
      },
    },
    {
      id: 'maxilar-temporal',
      titulo: 'Maxilar Superior — Dentición Temporal / Decidua (20 posiciones)',
      tipo: 'TEMPORAL',
      arcada: 'SUPERIOR',
      ladoDerecho: {
        cuadrante: 5,
        etiqueta: 'Cuadrante 5 (Superior Derecho)',
        piezas: cuadrante5.piezas.map((fdi) => ({
          numeroFDI: fdi,
          pieza: piezasMap[fdi] || null,
        })),
      },
      ladoIzquierdo: {
        cuadrante: 6,
        etiqueta: 'Cuadrante 6 (Superior Izquierdo)',
        piezas: cuadrante6.piezas.map((fdi) => ({
          numeroFDI: fdi,
          pieza: piezasMap[fdi] || null,
        })),
      },
    },
    {
      id: 'mandibula-temporal',
      titulo: 'Mandíbula — Dentición Temporal / Decidua',
      tipo: 'TEMPORAL',
      arcada: 'INFERIOR',
      ladoDerecho: {
        cuadrante: 8,
        etiqueta: 'Cuadrante 8 (Inferior Derecho)',
        piezas: cuadrante8.piezas.map((fdi) => ({
          numeroFDI: fdi,
          pieza: piezasMap[fdi] || null,
        })),
      },
      ladoIzquierdo: {
        cuadrante: 7,
        etiqueta: 'Cuadrante 7 (Inferior Izquierdo)',
        piezas: cuadrante7.piezas.map((fdi) => ({
          numeroFDI: fdi,
          pieza: piezasMap[fdi] || null,
        })),
      },
    },
    {
      id: 'mandibula-permanente',
      titulo: 'Mandíbula — Dentición Permanente',
      tipo: 'PERMANENTE',
      arcada: 'INFERIOR',
      ladoDerecho: {
        cuadrante: 4,
        etiqueta: 'Cuadrante 4 (Inferior Derecho)',
        piezas: cuadrante4.piezas.map((fdi) => ({
          numeroFDI: fdi,
          pieza: piezasMap[fdi] || null,
        })),
      },
      ladoIzquierdo: {
        cuadrante: 3,
        etiqueta: 'Cuadrante 3 (Inferior Izquierdo)',
        piezas: cuadrante3.piezas.map((fdi) => ({
          numeroFDI: fdi,
          pieza: piezasMap[fdi] || null,
        })),
      },
    },
  ];
}

/**
 * Calcula la orientación anatómica exacta de las 5 superficies para una pieza dental dada.
 *
 * En cuadrantes derechos del paciente (1, 4, 5, 8), la línea media dental está a la derecha del esquema.
 * Mesial (hacia línea media) está a la derecha, y Distal a la izquierda.
 * En cuadrantes izquierdos del paciente (2, 3, 6, 7), la línea media dental está a la izquierda.
 * Mesial está a la izquierda, y Distal a la derecha.
 *
 * @param {number} numeroFDI
 * @param {Record<string, { superficie: string, condicion: string, evaluada: boolean }>} [superficies={}]
 * @returns {object}
 */
export function calcularOrientacionSuperficies(numeroFDI, superficies = {}) {
  const cuadrante = obtenerCuadranteFDI(numeroFDI);
  const esLadoDerecho = cuadrante === 1 || cuadrante === 4 || cuadrante === 5 || cuadrante === 8;

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

  return {
    numeroFDI,
    cuadrante,
    esLadoDerechoPaciente: esLadoDerecho,
    superficieSuperior: {
      ...supVestibular,
      codigo: 'V',
      nombre: ETIQUETAS_SUPERFICIE[TIPO_SUPERFICIE.VESTIBULAR],
    },
    superficieInferior: {
      ...supPalatinaLingual,
      codigo: 'P/L',
      nombre: ETIQUETAS_SUPERFICIE[TIPO_SUPERFICIE.PALATINA_LINGUAL],
    },
    superficieCentro: {
      ...supOclusal,
      codigo: 'O/I',
      nombre: ETIQUETAS_SUPERFICIE[TIPO_SUPERFICIE.OCLUSAL_INCISAL],
    },
    superficieIzquierda: esLadoDerecho
      ? { ...supDistal, codigo: 'D', nombre: 'Distal (D)' }
      : { ...supMesial, codigo: 'M', nombre: 'Mesial (M)' },
    superficieDerecha: esLadoDerecho
      ? { ...supMesial, codigo: 'M', nombre: 'Mesial (M)' }
      : { ...supDistal, codigo: 'D', nombre: 'Distal (D)' },
  };
}

/**
 * Obtiene el resumen de presentación clínica y atributos de accesibilidad de una pieza.
 *
 * @param {number} numeroFDI
 * @param {object|null} pieza
 * @param {boolean} [isSelected=false]
 * @returns {object}
 */
export function obtenerResumenPiezaDental(numeroFDI, pieza = null, isSelected = false) {
  const estadoAnatomico = pieza?.estadoAnatomico || ESTADO_ANATOMICO.DESCONOCIDO;
  const estadoEvaluacion = pieza?.estadoEvaluacion || ESTADO_EVALUACION.NO_EVALUADO;
  const superficies = pieza?.superficies || {};
  const tratamientos = pieza?.tratamientosEstructurales || [];

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

  let sigla = '?';
  if (estadoAnatomico === ESTADO_ANATOMICO.PRESENTE) sigla = 'PRES';
  else if (estadoAnatomico === ESTADO_ANATOMICO.AUSENTE) sigla = 'AUS';
  else if (estadoAnatomico === ESTADO_ANATOMICO.EXTRAIDO) sigla = 'EXT';
  else if (estadoAnatomico === ESTADO_ANATOMICO.NO_ERUPCIONADO) sigla = 'N/E';

  const ariaLabel = `Pieza FDI ${numeroFDI}, Estado anatómico: ${ETIQUETAS_ESTADO_ANATOMICO[estadoAnatomico] || 'Desconocido'}, Evaluación: ${ETIQUETAS_ESTADO_EVALUACION[estadoEvaluacion] || 'No evaluado'}${tieneCariesOFractura ? ', Presenta patología activa' : ''}${tieneRestauracion ? ', Presenta restauración' : ''}${tieneTratamientoEstructural ? ', Con tratamiento estructural' : ''}`;

  return {
    numeroFDI,
    estadoAnatomico,
    estadoEvaluacion,
    sigla,
    isSelected,
    tieneCariesOFractura,
    tieneRestauracion,
    tieneTratamientoEstructural,
    ariaLabel,
    ariaPressed: isSelected,
  };
}

/**
 * Genera la estructura de datos completa para la ficha de detalle de una pieza seleccionada.
 *
 * @param {number} numeroFDI
 * @param {object|null} pieza
 * @returns {object}
 */
export function generarFichaDetallePieza(numeroFDI, pieza = null) {
  if (!numeroFDI || !esNumeroFDIValido(numeroFDI)) {
    return { tieneSeleccion: false };
  }

  const esPermanente = esDenticionPermanente(numeroFDI);
  const cuadrante = obtenerCuadranteFDI(numeroFDI);
  const descripcion = obtenerDescripcionPiezaFDI(numeroFDI);

  const estadoAnatomico = pieza?.estadoAnatomico || ESTADO_ANATOMICO.DESCONOCIDO;
  const estadoEvaluacion = pieza?.estadoEvaluacion || ESTADO_EVALUACION.NO_EVALUADO;
  const superficies = pieza?.superficies || {};
  const tratamientos = pieza?.tratamientosEstructurales || [];
  const observaciones = pieza?.observaciones || null;

  const listaSuperficies = [
    TIPO_SUPERFICIE.VESTIBULAR,
    TIPO_SUPERFICIE.PALATINA_LINGUAL,
    TIPO_SUPERFICIE.MESIAL,
    TIPO_SUPERFICIE.DISTAL,
    TIPO_SUPERFICIE.OCLUSAL_INCISAL,
  ].map((supKey) => {
    const s = superficies[supKey] || { condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false };
    return {
      clave: supKey,
      nombre: ETIQUETAS_SUPERFICIE[supKey] || supKey,
      condicion: s.condicion || CONDICION_SUPERFICIE.NO_EVALUADA,
      condicionEtiqueta: ETIQUETAS_CONDICION_SUPERFICIE[s.condicion] || 'No evaluada',
      evaluada: Boolean(s.evaluada),
    };
  });

  const tratamientosFormateados = tratamientos.map((t) => ({
    tipo: t.tipo,
    etiqueta: ETIQUETAS_TRATAMIENTO_ESTRUCTURAL[t.tipo] || t.tipo,
    fechaRegistro: t.fechaRegistro || null,
    consultaId: t.consultaId || null,
  }));

  return {
    tieneSeleccion: true,
    numeroFDI,
    esPermanente,
    esTemporal: esDenticionTemporal(numeroFDI),
    cuadrante,
    descripcion,
    estadoAnatomico,
    estadoAnatomicoEtiqueta: ETIQUETAS_ESTADO_ANATOMICO[estadoAnatomico] || estadoAnatomico,
    estadoEvaluacion,
    estadoEvaluacionEtiqueta: ETIQUETAS_ESTADO_EVALUACION[estadoEvaluacion] || estadoEvaluacion,
    superficies: listaSuperficies,
    tratamientos: tratamientosFormateados,
    observaciones,
    modoLectura: true,
  };
}
