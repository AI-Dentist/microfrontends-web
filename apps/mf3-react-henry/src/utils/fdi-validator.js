/**
 * Utilidades para la validación de piezas dentales según la nomenclatura internacional FDI (ISO 3950).
 * 
 * Reglas clínicas (INV-CONS-08):
 * - 52 piezas anatómicas posibles en total.
 * - Dentición permanente (adultos): cuadrantes 1 a 4, piezas 1 a 8 (32 piezas).
 * - Dentición decidua / temporal (niños): cuadrantes 5 a 8, piezas 1 a 5 (20 piezas).
 * - Cualquier otro número es anatómicamente inexistente (ej: 19, 20, 29, 56, 99).
 */

export const PIEZAS_FDI_VALIDAS = new Set([
  // Cuadrante 1: Superior Derecho Permanente
  11, 12, 13, 14, 15, 16, 17, 18,
  // Cuadrante 2: Superior Izquierdo Permanente
  21, 22, 23, 24, 25, 26, 27, 28,
  // Cuadrante 3: Inferior Izquierdo Permanente
  31, 32, 33, 34, 35, 36, 37, 38,
  // Cuadrante 4: Inferior Derecho Permanente
  41, 42, 43, 44, 45, 46, 47, 48,
  // Cuadrante 5: Superior Derecho Temporal
  51, 52, 53, 54, 55,
  // Cuadrante 6: Superior Izquierdo Temporal
  61, 62, 63, 64, 65,
  // Cuadrante 7: Inferior Izquierdo Temporal
  71, 72, 73, 74, 75,
  // Cuadrante 8: Inferior Derecho Temporal
  81, 82, 83, 84, 85,
]);

const NOMBRES_POSICION_PERMANENTE = {
  1: 'Incisivo Central',
  2: 'Incisivo Lateral',
  3: 'Canino',
  4: 'Primer Premolar',
  5: 'Segundo Premolar',
  6: 'Primer Molar',
  7: 'Segundo Molar',
  8: 'Tercer Molar',
};

const NOMBRES_POSICION_TEMPORAL = {
  1: 'Incisivo Central Temporal',
  2: 'Incisivo Lateral Temporal',
  3: 'Canino Temporal',
  4: 'Primer Molar Temporal',
  5: 'Segundo Molar Temporal',
};

const NOMBRES_CUADRANTE = {
  1: 'Superior Derecho',
  2: 'Superior Izquierdo',
  3: 'Inferior Izquierdo',
  4: 'Inferior Derecho',
  5: 'Superior Derecho Temporal',
  6: 'Superior Izquierdo Temporal',
  7: 'Inferior Izquierdo Temporal',
  8: 'Inferior Derecho Temporal',
};

/**
 * Valida si un valor numérico corresponde a una de las 52 piezas FDI válidas.
 * 
 * @param {number|string|null|undefined} valor
 * @returns {boolean}
 */
export function esPiezaFDIValida(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return false;
  }
  const num = Number(valor);
  if (!Number.isInteger(num)) {
    return false;
  }
  return PIEZAS_FDI_VALIDAS.has(num);
}

/**
 * Retorna la descripción anatómica de una pieza FDI.
 * 
 * @param {number|string} valor
 * @returns {string}
 */
export function obtenerDescripcionPiezaFDI(valor) {
  const num = Number(valor);
  if (!esPiezaFDIValida(num)) {
    return 'Pieza dental inválida según nomenclatura FDI';
  }

  const cuadrante = Math.floor(num / 10);
  const posicion = num % 10;
  const esPermanente = cuadrante >= 1 && cuadrante <= 4;

  const nombreDiente = esPermanente
    ? NOMBRES_POSICION_PERMANENTE[posicion]
    : NOMBRES_POSICION_TEMPORAL[posicion];
  const nombreCuadrante = NOMBRES_CUADRANTE[cuadrante];

  return `Pieza ${num} (${nombreDiente} - ${nombreCuadrante})`;
}

/**
 * Lista estructurada de todas las 52 piezas FDI para componentes de selección.
 */
export const LISTADO_PIEZAS_FDI = Array.from(PIEZAS_FDI_VALIDAS)
  .sort((a, b) => a - b)
  .map((numero) => ({
    valor: numero,
    descripcion: obtenerDescripcionPiezaFDI(numero),
    cuadrante: Math.floor(numero / 10),
    esPermanente: Math.floor(numero / 10) <= 4,
  }));
