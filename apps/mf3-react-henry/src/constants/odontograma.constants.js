/**
 * Constantes y contratos de dominio para el Odontograma Clínico (Iteración 7F-1).
 *
 * Sincronizado literalmente con los enums y value objects del backend NestJS:
 * - EstadoAnatomicoPieza
 * - EstadoEvaluacionPieza
 * - TipoSuperficie
 * - CondicionSuperficie
 * - TipoTratamientoEstructural
 * - TipoRevisionOdontograma
 *
 * Reglas clínicas inmutables:
 * - 52 posiciones anatómicas posibles de la nomenclatura internacional FDI (ISO 3950).
 * - Dentición permanente: 32 posiciones (cuadrantes 1 al 4, piezas 1 a 8).
 * - Dentición temporal / decidua: 20 posiciones (cuadrantes 5 al 8, piezas 1 a 5).
 * - DESCONOCIDO nunca debe interpretarse como PRESENTE ni SANO.
 * - NO_EVALUADO nunca debe interpretarse como ausencia de patología.
 */

/**
 * Estado anatómico real de la pieza dental en la cavidad oral.
 */
export const ESTADO_ANATOMICO = Object.freeze({
  DESCONOCIDO: 'DESCONOCIDO',
  PRESENTE: 'PRESENTE',
  AUSENTE: 'AUSENTE',
  EXTRAIDO: 'EXTRAIDO',
  NO_ERUPCIONADO: 'NO_ERUPCIONADO',
});

/**
 * Estado de examinación o inspección clínica de una pieza dental por el profesional.
 */
export const ESTADO_EVALUACION = Object.freeze({
  NO_EVALUADO: 'NO_EVALUADO',
  EVALUADO: 'EVALUADO',
});

/**
 * Las cinco superficies anatómicas dentales estándar.
 */
export const TIPO_SUPERFICIE = Object.freeze({
  VESTIBULAR: 'VESTIBULAR',
  PALATINA_LINGUAL: 'PALATINA_LINGUAL',
  MESIAL: 'MESIAL',
  DISTAL: 'DISTAL',
  OCLUSAL_INCISAL: 'OCLUSAL_INCISAL',
});

/**
 * Condición clínica observada en una superficie dental específica.
 */
export const CONDICION_SUPERFICIE = Object.freeze({
  NO_EVALUADA: 'NO_EVALUADA',
  SANA: 'SANA',
  CARIES: 'CARIES',
  OBTURACION_RESINA: 'OBTURACION_RESINA',
  OBTURACION_AMALGAMA: 'OBTURACION_AMALGAMA',
  FRACTURA: 'FRACTURA',
  SELLANTE: 'SELLANTE',
});

/**
 * Tratamiento estructural o protésico que compromete la pieza completa.
 */
export const TIPO_TRATAMIENTO_ESTRUCTURAL = Object.freeze({
  CORONA: 'CORONA',
  ENDODONCIA: 'ENDODONCIA',
  PERNO_MUÑON: 'PERNO_MUÑON',
  IMPLANTE: 'IMPLANTE',
});

/**
 * Clasificación de la revisión odontográfica registrada en el historial.
 */
export const TIPO_REVISION_ODONTOGRAMA = Object.freeze({
  NUEVA_OBSERVACION: 'NUEVA_OBSERVACION',
  ENMIENDA_CORRECTIVA: 'ENMIENDA_CORRECTIVA',
});

/**
 * Cuadrantes anatómicos según nomenclatura FDI.
 */
export const CUADRANTES = Object.freeze({
  SUPERIOR_DERECHO_PERMANENTE: 1,
  SUPERIOR_IZQUIERDO_PERMANENTE: 2,
  INFERIOR_IZQUIERDO_PERMANENTE: 3,
  INFERIOR_DERECHO_PERMANENTE: 4,
  SUPERIOR_DERECHO_TEMPORAL: 5,
  SUPERIOR_IZQUIERDO_TEMPORAL: 6,
  INFERIOR_IZQUIERDO_TEMPORAL: 7,
  INFERIOR_DERECHO_TEMPORAL: 8,
});

/**
 * Conjunto inmutable de las 52 posiciones FDI válidas.
 */
export const PIEZAS_FDI_VALIDAS_SET = Object.freeze(
  new Set([
    // Cuadrante 1: Superior Derecho Permanente (11 - 18)
    11, 12, 13, 14, 15, 16, 17, 18,
    // Cuadrante 2: Superior Izquierdo Permanente (21 - 28)
    21, 22, 23, 24, 25, 26, 27, 28,
    // Cuadrante 3: Inferior Izquierdo Permanente (31 - 38)
    31, 32, 33, 34, 35, 36, 37, 38,
    // Cuadrante 4: Inferior Derecho Permanente (41 - 48)
    41, 42, 43, 44, 45, 46, 47, 48,
    // Cuadrante 5: Superior Derecho Deciduo / Temporal (51 - 55)
    51, 52, 53, 54, 55,
    // Cuadrante 6: Superior Izquierdo Deciduo / Temporal (61 - 65)
    61, 62, 63, 64, 65,
    // Cuadrante 7: Inferior Izquierdo Deciduo / Temporal (71 - 75)
    71, 72, 73, 74, 75,
    // Cuadrante 8: Inferior Derecho Deciduo / Temporal (81 - 85)
    81, 82, 83, 84, 85,
  ]),
);

/**
 * Lista de superficies anatómicas estándar presentes en cada pieza.
 */
export const SUPERFICIES_DENTALES_ESTANDAR = Object.freeze([
  TIPO_SUPERFICIE.VESTIBULAR,
  TIPO_SUPERFICIE.PALATINA_LINGUAL,
  TIPO_SUPERFICIE.MESIAL,
  TIPO_SUPERFICIE.DISTAL,
  TIPO_SUPERFICIE.OCLUSAL_INCISAL,
]);

/**
 * Agrupación de piezas por cuadrante en orden anatómico clínico
 * (desde distal hacia línea media para cuadrantes derechos,
 *  y desde línea media hacia distal para cuadrantes izquierdos).
 */
export const AGRUPACION_CUADRANTES_FDI = Object.freeze({
  // Dentición permanente
  cuadrante1: Object.freeze({
    id: 1,
    nombre: 'Superior Derecho Permanente',
    tipo: 'PERMANENTE',
    arcada: 'SUPERIOR',
    lado: 'DERECHO',
    piezas: Object.freeze([18, 17, 16, 15, 14, 13, 12, 11]),
  }),
  cuadrante2: Object.freeze({
    id: 2,
    nombre: 'Superior Izquierdo Permanente',
    tipo: 'PERMANENTE',
    arcada: 'SUPERIOR',
    lado: 'IZQUIERDO',
    piezas: Object.freeze([21, 22, 23, 24, 25, 26, 27, 28]),
  }),
  cuadrante3: Object.freeze({
    id: 3,
    nombre: 'Inferior Izquierdo Permanente',
    tipo: 'PERMANENTE',
    arcada: 'INFERIOR',
    lado: 'IZQUIERDO',
    piezas: Object.freeze([31, 32, 33, 34, 35, 36, 37, 38]),
  }),
  cuadrante4: Object.freeze({
    id: 4,
    nombre: 'Inferior Derecho Permanente',
    tipo: 'PERMANENTE',
    arcada: 'INFERIOR',
    lado: 'DERECHO',
    piezas: Object.freeze([48, 47, 46, 45, 44, 43, 42, 41]),
  }),

  // Dentición temporal
  cuadrante5: Object.freeze({
    id: 5,
    nombre: 'Superior Derecho Temporal',
    tipo: 'TEMPORAL',
    arcada: 'SUPERIOR',
    lado: 'DERECHO',
    piezas: Object.freeze([55, 54, 53, 52, 51]),
  }),
  cuadrante6: Object.freeze({
    id: 6,
    nombre: 'Superior Izquierdo Temporal',
    tipo: 'TEMPORAL',
    arcada: 'SUPERIOR',
    lado: 'IZQUIERDO',
    piezas: Object.freeze([61, 62, 63, 64, 65]),
  }),
  cuadrante7: Object.freeze({
    id: 7,
    nombre: 'Inferior Izquierdo Temporal',
    tipo: 'TEMPORAL',
    arcada: 'INFERIOR',
    lado: 'IZQUIERDO',
    piezas: Object.freeze([71, 72, 73, 74, 75]),
  }),
  cuadrante8: Object.freeze({
    id: 8,
    nombre: 'Inferior Derecho Temporal',
    tipo: 'TEMPORAL',
    arcada: 'INFERIOR',
    lado: 'DERECHO',
    piezas: Object.freeze([85, 84, 83, 82, 81]),
  }),
});

/**
 * Etiquetas clínicas legibles para visualización e interfaz (preparación 7F-2).
 */
export const ETIQUETAS_ESTADO_ANATOMICO = Object.freeze({
  [ESTADO_ANATOMICO.DESCONOCIDO]: 'Desconocido (No explorado)',
  [ESTADO_ANATOMICO.PRESENTE]: 'Presente en boca',
  [ESTADO_ANATOMICO.AUSENTE]: 'Ausente congénito (Agenesia)',
  [ESTADO_ANATOMICO.EXTRAIDO]: 'Extraído / Pérdida dental',
  [ESTADO_ANATOMICO.NO_ERUPCIONADO]: 'No erupcionado / Retenido',
});

export const ETIQUETAS_ESTADO_EVALUACION = Object.freeze({
  [ESTADO_EVALUACION.NO_EVALUADO]: 'No evaluado',
  [ESTADO_EVALUACION.EVALUADO]: 'Evaluado clínicamente',
});

export const ETIQUETAS_SUPERFICIE = Object.freeze({
  [TIPO_SUPERFICIE.VESTIBULAR]: 'Vestibular (V)',
  [TIPO_SUPERFICIE.PALATINA_LINGUAL]: 'Palatina / Lingual (P/L)',
  [TIPO_SUPERFICIE.MESIAL]: 'Mesial (M)',
  [TIPO_SUPERFICIE.DISTAL]: 'Distal (D)',
  [TIPO_SUPERFICIE.OCLUSAL_INCISAL]: 'Oclusal / Incisal (O/I)',
});

export const ETIQUETAS_CONDICION_SUPERFICIE = Object.freeze({
  [CONDICION_SUPERFICIE.NO_EVALUADA]: 'No evaluada',
  [CONDICION_SUPERFICIE.SANA]: 'Sana (Sin lesión)',
  [CONDICION_SUPERFICIE.CARIES]: 'Caries activa',
  [CONDICION_SUPERFICIE.OBTURACION_RESINA]: 'Obturación con resina',
  [CONDICION_SUPERFICIE.OBTURACION_AMALGAMA]: 'Obturación con amalgama',
  [CONDICION_SUPERFICIE.FRACTURA]: 'Fractura dental',
  [CONDICION_SUPERFICIE.SELLANTE]: 'Sellante de fosas y fisuras',
});

export const ETIQUETAS_TRATAMIENTO_ESTRUCTURAL = Object.freeze({
  [TIPO_TRATAMIENTO_ESTRUCTURAL.CORONA]: 'Corona protésica',
  [TIPO_TRATAMIENTO_ESTRUCTURAL.ENDODONCIA]: 'Tratamiento de conducto (Endodoncia)',
  [TIPO_TRATAMIENTO_ESTRUCTURAL.PERNO_MUÑON]: 'Perno - Muñón',
  [TIPO_TRATAMIENTO_ESTRUCTURAL.IMPLANTE]: 'Implante osteointegrado',
});

export const ETIQUETAS_TIPO_REVISION = Object.freeze({
  [TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION]: 'Nueva observación clínica',
  [TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA]: 'Enmienda correctiva formal',
});

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de validación e inspección anatómica
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determina si un número corresponde a una de las 52 posiciones FDI válidas.
 *
 * @param {number|string} valor
 * @returns {boolean}
 */
export function esNumeroFDIValido(valor) {
  if (valor === null || valor === undefined || valor === '') return false;
  const num = Number(valor);
  return Number.isInteger(num) && PIEZAS_FDI_VALIDAS_SET.has(num);
}

/**
 * Obtiene el cuadrante anatómico (1 a 8) de un número FDI.
 *
 * @param {number} numeroFDI
 * @returns {number|null}
 */
export function obtenerCuadranteFDI(numeroFDI) {
  if (!esNumeroFDIValido(numeroFDI)) return null;
  return Math.floor(Number(numeroFDI) / 10);
}

/**
 * Determina si la pieza corresponde a la dentición permanente de adultos (cuadrantes 1 al 4).
 *
 * @param {number} numeroFDI
 * @returns {boolean}
 */
export function esDenticionPermanente(numeroFDI) {
  const cuadrante = obtenerCuadranteFDI(numeroFDI);
  return cuadrante !== null && cuadrante >= 1 && cuadrante <= 4;
}

/**
 * Determina si la pieza corresponde a la dentición temporal o decidua (cuadrantes 5 al 8).
 *
 * @param {number} numeroFDI
 * @returns {boolean}
 */
export function esDenticionTemporal(numeroFDI) {
  const cuadrante = obtenerCuadranteFDI(numeroFDI);
  return cuadrante !== null && cuadrante >= 5 && cuadrante <= 8;
}

/**
 * Valida defensivamente que un objeto de pieza dental conserve los estados
 * basales y no interprete DESCONOCIDO como PRESENTE/SANO ni NO_EVALUADO como ausencia de enfermedad.
 *
 * @param {object} pieza
 * @returns {{ esValida: boolean, motivo?: string }}
 */
export function validarPreservacionBasalPieza(pieza) {
  if (!pieza || typeof pieza !== 'object') {
    return { esValida: false, motivo: 'La pieza dental no es un objeto válido.' };
  }

  if (!esNumeroFDIValido(pieza.numeroFDI)) {
    return { esValida: false, motivo: `Número FDI inválido: ${pieza.numeroFDI}` };
  }

  if (!Object.values(ESTADO_ANATOMICO).includes(pieza.estadoAnatomico)) {
    return {
      esValida: false,
      motivo: `Estado anatómico no reconocido: ${pieza.estadoAnatomico}`,
    };
  }

  if (!Object.values(ESTADO_EVALUACION).includes(pieza.estadoEvaluacion)) {
    return {
      esValida: false,
      motivo: `Estado de evaluación no reconocido: ${pieza.estadoEvaluacion}`,
    };
  }

  // Si el estado anatómico es DESCONOCIDO, no debe asumirse PRESENTE ni SANO
  if (pieza.estadoAnatomico === ESTADO_ANATOMICO.DESCONOCIDO) {
    if (pieza.estadoEvaluacion === ESTADO_EVALUACION.EVALUADO && !pieza.observaciones) {
      // Estado DESCONOCIDO con EVALUADO requiere observación clínica
    }
  }

  return { esValida: true };
}
