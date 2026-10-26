/**
 * Utilidades puras para el cálculo y validación de deltas del Odontograma (Iteración 7F-3A).
 *
 * Principios:
 * - Funciones 100% puras sin efectos secundarios ni llamadas a la red.
 * - Comparación estricta: Snapshot original del servidor → Borrador en memoria → Deltas HTTP.
 * - Cada cambio de superficie incluye condicionAnterior y condicionNueva.
 * - Los cambios revertidos son eliminados (no generan deltas residuales).
 * - No se generan deltas si no existen cambios efectivos.
 */

import {
  ESTADO_ANATOMICO,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
  TIPO_TRATAMIENTO_ESTRUCTURAL,
  esNumeroFDIValido,
} from '../constants/odontograma.constants.js';

const SUPERFICIES_ESTANDAR = Object.freeze([
  TIPO_SUPERFICIE.VESTIBULAR,
  TIPO_SUPERFICIE.PALATINA_LINGUAL,
  TIPO_SUPERFICIE.MESIAL,
  TIPO_SUPERFICIE.DISTAL,
  TIPO_SUPERFICIE.OCLUSAL_INCISAL,
]);

/**
 * Normaliza la condición de una superficie permitiendo tanto strings planos como objetos.
 *
 * @param {string|{ condicion: string }|undefined} val
 * @returns {string}
 */
export function normalizarCondicionSuperficie(val) {
  if (!val) return CONDICION_SUPERFICIE.NO_EVALUADA;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.condicion) return val.condicion;
  return CONDICION_SUPERFICIE.NO_EVALUADA;
}

/**
 * Valida reglas de invariantes clínicas locales para el borrador:
 * - INV-ODO-02: Solo piezas en estado PRESENTE admiten lesiones (caries) o restauraciones.
 * - INV-ODO-04: El borde incisal de dientes anteriores (FDI x1, x2, x3) no admite sellantes.
 * - Tratamientos estructurales como Corona o Endodoncia requieren que la pieza esté PRESENTE.
 *
 * Soporta dos firmas:
 * 1. validarInvariantesBorrador(numeroFDI, estadoAnatomico, superficies, tratamientoEstructuralAgregado)
 * 2. validarInvariantesBorrador(numeroFDI, { estadoAnatomico, superficies, tratamientoEstructuralAgregado })
 *
 * @param {number} numeroFDI
 * @param {string|object} estadoOObjeto
 * @param {Record<string, any>} [superficiesArg]
 * @param {string|null} [tratamientoArg]
 * @returns {{ esValido: boolean, error: string|null, advertencias: string[], length: number }}
 */
export function validarInvariantesBorrador(
  numeroFDI,
  estadoOObjeto,
  superficiesArg = {},
  tratamientoArg = null,
) {
  let estadoAnatomico = estadoOObjeto;
  let superficies = superficiesArg;
  let tratamientoEstructuralAgregado = tratamientoArg;

  if (typeof estadoOObjeto === 'object' && estadoOObjeto !== null) {
    estadoAnatomico = estadoOObjeto.estadoAnatomico;
    superficies = estadoOObjeto.superficies || {};
    tratamientoEstructuralAgregado =
      estadoOObjeto.tratamientoEstructuralAgregado ||
      (Array.isArray(estadoOObjeto.tratamientosEstructurales) &&
        estadoOObjeto.tratamientosEstructurales[0]) ||
      null;
  }

  const fdiNum = Number(numeroFDI);
  if (!esNumeroFDIValido(fdiNum)) {
    const error = `Número FDI no anatómico: ${numeroFDI}`;
    return { esValido: false, error, advertencias: [error], length: 1 };
  }

  // Regla INV-ODO-02: Solo piezas con estado anatómico PRESENTE admiten caries o restauraciones
  const esPresente = estadoAnatomico === ESTADO_ANATOMICO.PRESENTE;

  for (const supKey of SUPERFICIES_ESTANDAR) {
    const condicion = normalizarCondicionSuperficie(superficies[supKey]);
    if (condicion && condicion !== CONDICION_SUPERFICIE.NO_EVALUADA) {
      if (!esPresente) {
        const error = `La superficie ${supKey} no puede tener la condición "${condicion}" si la pieza dental no está en estado PRESENTE (estado actual: ${estadoAnatomico}).`;
        return { esValido: false, error, advertencias: [error], length: 1 };
      }
    }
  }

  // Regla INV-ODO-04: Dientes anteriores no admiten sellantes en OCLUSAL_INCISAL
  const posicion = fdiNum % 10;
  const esAnterior = posicion <= 3;
  const condOclusal = normalizarCondicionSuperficie(superficies[TIPO_SUPERFICIE.OCLUSAL_INCISAL]);
  if (esAnterior && condOclusal === CONDICION_SUPERFICIE.SELLANTE) {
    const error = `El borde incisal de piezas anteriores (posición ${posicion}) no admite sellantes de fosas y fisuras.`;
    return { esValido: false, error, advertencias: [error], length: 1 };
  }

  // Tratamiento estructural: CORONA, ENDODONCIA, PERNO_MUÑON requieren PRESENTE. IMPLANTE admite no presente.
  if (
    tratamientoEstructuralAgregado &&
    tratamientoEstructuralAgregado !== TIPO_TRATAMIENTO_ESTRUCTURAL.IMPLANTE &&
    !esPresente
  ) {
    const error = `El tratamiento ${tratamientoEstructuralAgregado} requiere que la pieza esté en estado PRESENTE.`;
    return { esValido: false, error, advertencias: [error], length: 1 };
  }

  return { esValido: true, error: null, advertencias: [], length: 0 };
}

/**
 * Compara el snapshot original de una pieza con su borrador local para calcular
 * el delta atómico (DeltaPiezaDto) compatible con el backend.
 *
 * @param {object} piezaOriginal - PiezaDentalDto del snapshot del servidor
 * @param {object} piezaBorrador - Estado borrador editado en memoria
 * @returns {object|null} DeltaPiezaDto o null si no hubo cambios efectivos
 */
export function calcularDeltaPieza(piezaOriginal, piezaBorrador) {
  if (!piezaOriginal || !piezaBorrador) return null;
  const numeroFDI = Number(piezaOriginal.numeroFDI);

  let hayCambios = false;
  const delta = { numeroFDI };

  // 1. Cambio anatómico
  const estadoOriginal = piezaOriginal.estadoAnatomico || ESTADO_ANATOMICO.DESCONOCIDO;
  const estadoNuevo = piezaBorrador.estadoAnatomico || estadoOriginal;

  if (estadoNuevo !== estadoOriginal) {
    delta.estadoAnatomicoAnterior = estadoOriginal;
    delta.estadoAnatomicoNuevo = estadoNuevo;
    hayCambios = true;
  }

  // 2. Modificaciones de superficie
  const superficiesModificadas = [];
  const supsOriginales = piezaOriginal.superficies || {};
  const supsBorrador = piezaBorrador.superficies || {};

  for (const supKey of SUPERFICIES_ESTANDAR) {
    const condOriginal = normalizarCondicionSuperficie(supsOriginales[supKey]);
    const condNueva =
      supsBorrador[supKey] !== undefined
        ? normalizarCondicionSuperficie(supsBorrador[supKey])
        : condOriginal;

    if (condNueva !== condOriginal) {
      superficiesModificadas.push({
        superficie: supKey,
        condicionAnterior: condOriginal,
        condicionNueva: condNueva,
      });
      hayCambios = true;
    }
  }

  if (superficiesModificadas.length > 0) {
    delta.superficiesModificadas = superficiesModificadas;
  }

  // 3. Tratamiento estructural agregado
  let tratamientoNuevo = piezaBorrador.tratamientoEstructuralAgregado;
  if (!tratamientoNuevo && Array.isArray(piezaBorrador.tratamientosEstructurales)) {
    const tiposOriginales = (piezaOriginal.tratamientosEstructurales || []).map((t) =>
      typeof t === 'string' ? t : t.tipo,
    );
    const tiposBorrador = piezaBorrador.tratamientosEstructurales.map((t) =>
      typeof t === 'string' ? t : t.tipo,
    );
    tratamientoNuevo = tiposBorrador.find((t) => !tiposOriginales.includes(t));
  }

  if (tratamientoNuevo) {
    const tiposExistentes = (piezaOriginal.tratamientosEstructurales || []).map((t) =>
      typeof t === 'string' ? t : t.tipo,
    );
    if (!tiposExistentes.includes(tratamientoNuevo)) {
      delta.tratamientoEstructuralAgregado = tratamientoNuevo;
      hayCambios = true;
    }
  }

  // 4. Observaciones clínicas
  const obsOriginal = (piezaOriginal.observaciones || '').trim();
  const obsNueva =
    piezaBorrador.observaciones !== undefined
      ? (piezaBorrador.observaciones || '').trim()
      : obsOriginal;

  if (obsNueva !== obsOriginal) {
    delta.observaciones = obsNueva.slice(0, 500);
    hayCambios = true;
  }

  return hayCambios ? delta : null;
}

/**
 * Compara todas las piezas modificadas en el borrador contra el snapshot original
 * y genera la lista de deltas que conformarán el payload de registro de revisión.
 *
 * @param {object|Array<object>} odontogramaOriginal - OdontogramaActualDto o lista de piezas
 * @param {Record<number, object>} [borradorModificaciones={}] - Diccionario de borradores por FDI
 * @returns {Array<object>} Lista de DeltaPiezaDto ordenados por numeroFDI
 */
export function calcularDeltasOdontograma(odontogramaOriginal, borradorModificaciones = {}) {
  if (!odontogramaOriginal || !borradorModificaciones) return [];

  const piezas = Array.isArray(odontogramaOriginal)
    ? odontogramaOriginal
    : odontogramaOriginal.piezas || Object.values(odontogramaOriginal);

  const deltas = [];
  const piezasOriginalesMap = {};
  for (const p of piezas) {
    if (p && p.numeroFDI) {
      piezasOriginalesMap[p.numeroFDI] = p;
    }
  }

  const fdisModificados = Object.keys(borradorModificaciones)
    .map(Number)
    .sort((a, b) => a - b);

  for (const fdi of fdisModificados) {
    const original = piezasOriginalesMap[fdi];
    const borrador = borradorModificaciones[fdi];

    if (original && borrador) {
      const delta = calcularDeltaPieza(original, borrador);
      if (delta) {
        deltas.push(delta);
      }
    }
  }

  return deltas;
}

/**
 * Resume cuantitativa y cualitativamente los cambios del borrador respecto al original.
 *
 * @param {object|Array<object>} odontogramaOriginal
 * @param {Record<number, object>} [borradorModificaciones={}]
 * @returns {object}
 */
export function resumirCambiosBorrador(odontogramaOriginal, borradorModificaciones = {}) {
  const deltas = calcularDeltasOdontograma(odontogramaOriginal, borradorModificaciones);

  let totalSuperficiesModificadas = 0;
  let totalCambiosAnatomicos = 0;
  let totalTratamientosAgregados = 0;
  let totalObservaciones = 0;

  for (const d of deltas) {
    if (d.estadoAnatomicoNuevo) totalCambiosAnatomicos++;
    if (d.superficiesModificadas) totalSuperficiesModificadas += d.superficiesModificadas.length;
    if (d.tratamientoEstructuralAgregado) totalTratamientosAgregados++;
    if (d.observaciones !== undefined) totalObservaciones++;
  }

  return {
    hayCambios: deltas.length > 0,
    piezasModificadas: deltas.length,
    totalPiezasModificadas: deltas.length,
    superficiesModificadas: totalSuperficiesModificadas,
    totalSuperficiesModificadas,
    cambiosAnatomicos: totalCambiosAnatomicos,
    totalCambiosAnatomicos,
    tratamientosAgregados: totalTratamientosAgregados,
    totalTratamientosAgregados,
    totalObservaciones,
    deltas,
  };
}
