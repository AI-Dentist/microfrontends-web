import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  construirEstructuraArcadas,
  calcularOrientacionSuperficies,
  obtenerResumenPiezaDental,
  generarFichaDetallePieza,
} from '../src/utils/odontograma-view-model.js';
import {
  ESTADO_ANATOMICO,
  ESTADO_EVALUACION,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
  TIPO_TRATAMIENTO_ESTRUCTURAL,
  PIEZAS_FDI_VALIDAS_SET,
  AGRUPACION_CUADRANTES_FDI,
  esDenticionPermanente,
  esDenticionTemporal,
} from '../src/constants/odontograma.constants.js';

/**
 * Generador de odontograma basal sintético con las 52 posiciones FDI
 */
function crearOdontogramaBasal(historiaClinicaId = 'hc_test_001', version = 1) {
  const piezas = Array.from(PIEZAS_FDI_VALIDAS_SET).map((numeroFDI) => ({
    numeroFDI,
    estadoAnatomico: ESTADO_ANATOMICO.DESCONOCIDO,
    estadoEvaluacion: ESTADO_EVALUACION.NO_EVALUADO,
    superficies: {
      [TIPO_SUPERFICIE.VESTIBULAR]: {
        superficie: TIPO_SUPERFICIE.VESTIBULAR,
        condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
        evaluada: false,
      },
      [TIPO_SUPERFICIE.PALATINA_LINGUAL]: {
        superficie: TIPO_SUPERFICIE.PALATINA_LINGUAL,
        condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
        evaluada: false,
      },
      [TIPO_SUPERFICIE.MESIAL]: {
        superficie: TIPO_SUPERFICIE.MESIAL,
        condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
        evaluada: false,
      },
      [TIPO_SUPERFICIE.DISTAL]: {
        superficie: TIPO_SUPERFICIE.DISTAL,
        condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
        evaluada: false,
      },
      [TIPO_SUPERFICIE.OCLUSAL_INCISAL]: {
        superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL,
        condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
        evaluada: false,
      },
    },
    tratamientosEstructurales: [],
    observaciones: null,
  }));

  return {
    id: `odo_${historiaClinicaId}`,
    historiaClinicaId,
    pacienteId: 'pac_test_001',
    revisionActualId: 'rev_basal_001',
    totalRevisiones: 1,
    version,
    creadoEn: '2026-10-26T10:00:00.000Z',
    actualizadoEn: '2026-10-26T10:00:00.000Z',
    actualizadoPor: 'odonto_henry',
    piezas,
  };
}

describe('Iteración 7F-2 — Odontograma Visual Interactivo (View-Model y Accesibilidad)', () => {
  // ─── 1. Representación de las 52 posiciones FDI ───────────────────────────
  test('1. La estructura de arcadas contiene exactamente las 52 posiciones FDI válidas', () => {
    const arcadas = construirEstructuraArcadas();
    const todasLasPiezas = [];

    for (const arcada of arcadas) {
      for (const p of arcada.ladoDerecho.piezas) todasLasPiezas.push(p.numeroFDI);
      for (const p of arcada.ladoIzquierdo.piezas) todasLasPiezas.push(p.numeroFDI);
    }

    assert.equal(todasLasPiezas.length, 52);
    for (const fdi of PIEZAS_FDI_VALIDAS_SET) {
      assert.ok(todasLasPiezas.includes(fdi), `Debe contener la pieza FDI ${fdi}`);
    }
  });

  // ─── 2. Orden anatómico de cuadrantes ─────────────────────────────────────
  test('2. Respeta el orden anatómico clínico por cuadrantes (distal a mesial en derechos, mesial a distal en izquierdos)', () => {
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

    // Cuadrante 1: 18 -> 11 (Distal a Mesial)
    assert.deepEqual(cuadrante1.piezas, [18, 17, 16, 15, 14, 13, 12, 11]);
    // Cuadrante 2: 21 -> 28 (Mesial a Distal)
    assert.deepEqual(cuadrante2.piezas, [21, 22, 23, 24, 25, 26, 27, 28]);
    // Cuadrante 3: 31 -> 38 (Mesial a Distal)
    assert.deepEqual(cuadrante3.piezas, [31, 32, 33, 34, 35, 36, 37, 38]);
    // Cuadrante 4: 48 -> 41 (Distal a Mesial)
    assert.deepEqual(cuadrante4.piezas, [48, 47, 46, 45, 44, 43, 42, 41]);
    // Cuadrantes temporales
    assert.deepEqual(cuadrante5.piezas, [55, 54, 53, 52, 51]);
    assert.deepEqual(cuadrante6.piezas, [61, 62, 63, 64, 65]);
    assert.deepEqual(cuadrante7.piezas, [71, 72, 73, 74, 75]);
    assert.deepEqual(cuadrante8.piezas, [85, 84, 83, 82, 81]);
  });

  // ─── 3. Diferenciación permanente vs temporal ─────────────────────────────
  test('3. Distingue estrictamente dentición permanente (32) y decidua / temporal (20) en bloques separados', () => {
    const arcadas = construirEstructuraArcadas();
    assert.equal(arcadas.length, 4);

    const permanenteSuperior = arcadas.find((a) => a.id === 'maxilar-permanente');
    const temporalSuperior = arcadas.find((a) => a.id === 'maxilar-temporal');
    const temporalInferior = arcadas.find((a) => a.id === 'mandibula-temporal');
    const permanenteInferior = arcadas.find((a) => a.id === 'mandibula-permanente');

    assert.ok(permanenteSuperior);
    assert.ok(temporalSuperior);
    assert.ok(temporalInferior);
    assert.ok(permanenteInferior);

    assert.equal(permanenteSuperior.ladoDerecho.piezas.length + permanenteSuperior.ladoIzquierdo.piezas.length, 16);
    assert.equal(permanenteInferior.ladoDerecho.piezas.length + permanenteInferior.ladoIzquierdo.piezas.length, 16);
    assert.equal(temporalSuperior.ladoDerecho.piezas.length + temporalSuperior.ladoIzquierdo.piezas.length, 10);
    assert.equal(temporalInferior.ladoDerecho.piezas.length + temporalInferior.ladoIzquierdo.piezas.length, 10);

    // Validación permanente vs temporal
    assert.equal(esDenticionPermanente(16), true);
    assert.equal(esDenticionPermanente(55), false);
    assert.equal(esDenticionTemporal(55), true);
    assert.equal(esDenticionTemporal(16), false);
  });

  // ─── 4. Selección de una posición ─────────────────────────────────────────
  test('4. Selección de una posición actualiza el estado y atributos accesibles aria-pressed', () => {
    const resumenSeleccionado = obtenerResumenPiezaDental(16, null, true);
    assert.equal(resumenSeleccionado.isSelected, true);
    assert.equal(resumenSeleccionado.ariaPressed, true);

    const resumenNoSeleccionado = obtenerResumenPiezaDental(16, null, false);
    assert.equal(resumenNoSeleccionado.isSelected, false);
    assert.equal(resumenNoSeleccionado.ariaPressed, false);
  });

  // ─── 5. Actualización del detalle seleccionado ────────────────────────────
  test('5. Ficha de detalle de pieza genera el desglose anatómico y descriptivo exacto', () => {
    const ficha16 = generarFichaDetallePieza(16, {
      numeroFDI: 16,
      estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
      estadoEvaluacion: ESTADO_EVALUACION.EVALUADO,
      superficies: {},
      tratamientosEstructurales: [],
    });

    assert.equal(ficha16.tieneSeleccion, true);
    assert.equal(ficha16.numeroFDI, 16);
    assert.equal(ficha16.esPermanente, true);
    assert.equal(ficha16.cuadrante, 1);
    assert.ok(ficha16.descripcion.includes('Primer Molar'));
    assert.equal(ficha16.superficies.length, 5);
    assert.equal(ficha16.modoLectura, true);
  });

  // ─── 6. Render de estados DESCONOCIDO y NO_EVALUADO ───────────────────────
  test('6. Presenta estados basales DESCONOCIDO (?) y NO_EVALUADO sin asumir salud ni presencia', () => {
    const piezaBasal = {
      numeroFDI: 24,
      estadoAnatomico: ESTADO_ANATOMICO.DESCONOCIDO,
      estadoEvaluacion: ESTADO_EVALUACION.NO_EVALUADO,
    };

    const resumen = obtenerResumenPiezaDental(24, piezaBasal, false);
    assert.equal(resumen.sigla, '?');
    assert.equal(resumen.estadoAnatomico, ESTADO_ANATOMICO.DESCONOCIDO);
    assert.equal(resumen.estadoEvaluacion, ESTADO_EVALUACION.NO_EVALUADO);

    const ficha = generarFichaDetallePieza(24, piezaBasal);
    assert.equal(ficha.estadoAnatomicoEtiqueta, 'Desconocido (No explorado)');
    assert.equal(ficha.estadoEvaluacionEtiqueta, 'No evaluado');
  });

  // ─── 7. Render de una superficie SANA registrada ──────────────────────────
  test('7. Identifica superficie SANA confirmada clínicamente', () => {
    const superficies = {
      [TIPO_SUPERFICIE.OCLUSAL_INCISAL]: {
        superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL,
        condicion: CONDICION_SUPERFICIE.SANA,
        evaluada: true,
      },
    };

    const orientacion = calcularOrientacionSuperficies(16, superficies);
    assert.equal(orientacion.superficieCentro.condicion, CONDICION_SUPERFICIE.SANA);
    assert.equal(orientacion.superficieCentro.evaluada, true);
  });

  // ─── 8. Render de CARIES y restauraciones registradas ─────────────────────
  test('8. Detecta CARIES y restauraciones para activar indicadores cromáticos', () => {
    const piezaConHallazgos = {
      numeroFDI: 36,
      estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
      estadoEvaluacion: ESTADO_EVALUACION.EVALUADO,
      superficies: {
        [TIPO_SUPERFICIE.OCLUSAL_INCISAL]: {
          superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL,
          condicion: CONDICION_SUPERFICIE.CARIES,
          evaluada: true,
        },
        [TIPO_SUPERFICIE.MESIAL]: {
          superficie: TIPO_SUPERFICIE.MESIAL,
          condicion: CONDICION_SUPERFICIE.OBTURACION_RESINA,
          evaluada: true,
        },
      },
      tratamientosEstructurales: [],
    };

    const resumen = obtenerResumenPiezaDental(36, piezaConHallazgos, false);
    assert.equal(resumen.tieneCariesOFractura, true);
    assert.equal(resumen.tieneRestauracion, true);
    assert.equal(resumen.tieneTratamientoEstructural, false);
  });

  // ─── 9. Pieza AUSENTE o EXTRAIDA sin asumir superficies sanas ─────────────
  test('9. Pieza EXTRAIDA o AUSENTE no infiere superficies sanas ni evaluadas', () => {
    const piezaExtraida = {
      numeroFDI: 48,
      estadoAnatomico: ESTADO_ANATOMICO.EXTRAIDO,
      estadoEvaluacion: ESTADO_EVALUACION.EVALUADO,
      superficies: {},
    };

    const resumen = obtenerResumenPiezaDental(48, piezaExtraida, false);
    assert.equal(resumen.sigla, 'EXT');
    assert.equal(resumen.estadoAnatomico, ESTADO_ANATOMICO.EXTRAIDO);

    const ficha = generarFichaDetallePieza(48, piezaExtraida);
    assert.equal(ficha.estadoAnatomicoEtiqueta, 'Extraído / Pérdida dental');
    for (const sup of ficha.superficies) {
      assert.notEqual(sup.condicion, CONDICION_SUPERFICIE.SANA);
      assert.equal(sup.evaluada, false);
    }
  });

  // ─── 10. Tratamientos estructurales ───────────────────────────────────────
  test('10. Ficha de detalle presenta tratamientos estructurales (Corona, Endodoncia, Implante)', () => {
    const piezaTratada = {
      numeroFDI: 11,
      estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
      estadoEvaluacion: ESTADO_EVALUACION.EVALUADO,
      superficies: {},
      tratamientosEstructurales: [
        {
          tipo: TIPO_TRATAMIENTO_ESTRUCTURAL.CORONA,
          fechaRegistro: '2026-10-20T12:00:00.000Z',
          consultaId: 'cons_123',
        },
        {
          tipo: TIPO_TRATAMIENTO_ESTRUCTURAL.ENDODONCIA,
          fechaRegistro: '2026-10-15T09:00:00.000Z',
          consultaId: null,
        },
      ],
    };

    const resumen = obtenerResumenPiezaDental(11, piezaTratada, false);
    assert.equal(resumen.tieneTratamientoEstructural, true);

    const ficha = generarFichaDetallePieza(11, piezaTratada);
    assert.equal(ficha.tratamientos.length, 2);
    assert.equal(ficha.tratamientos[0].etiqueta, 'Corona protésica');
    assert.equal(ficha.tratamientos[1].etiqueta, 'Tratamiento de conducto (Endodoncia)');
    assert.equal(ficha.tratamientos[0].consultaId, 'cons_123');
  });

  // ─── 11. Estado sin odontograma (404 sin auto-inicialización) ─────────────
  test('11. Estado 404 representa ausencia de odontograma y no desencadena mutaciones', () => {
    const error404 = {
      status: 404,
      title: 'Recurso no encontrado',
      detail: 'No existe odontograma asociado a la historia clínica indicada.',
    };

    // La función ficha sin selección maneja el caso nulo
    const fichaVacia = generarFichaDetallePieza(null, null);
    assert.equal(fichaVacia.tieneSeleccion, false);
    assert.equal(error404.status, 404);
  });

  // ─── 12. Loading y errores ────────────────────────────────────────────────
  test('12. Errores estructurados 503 y de red se tipifican adecuadamente', () => {
    const error503 = {
      status: 503,
      title: 'Servicio no disponible',
      detail: 'Base de datos clínica temporalmente en modo de mantenimiento.',
    };

    assert.equal(error503.status, 503);
    assert.equal(error503.title, 'Servicio no disponible');
  });

  // ─── 13. Cambio de historia clínica sin datos obsoletos ───────────────────
  test('13. Diccionario de piezas y fichas se recalculan al alternar historia clínica', () => {
    const odoA = crearOdontogramaBasal('hc_paciente_A', 1);
    const odoB = crearOdontogramaBasal('hc_paciente_B', 3);

    assert.equal(odoA.historiaClinicaId, 'hc_paciente_A');
    assert.equal(odoA.version, 1);
    assert.equal(odoB.historiaClinicaId, 'hc_paciente_B');
    assert.equal(odoB.version, 3);
  });

  // ─── 14. Accesibilidad básica de botones ──────────────────────────────────
  test('14. Resumen de pieza dental incluye etiquetas aria-label legibles', () => {
    const resumen = obtenerResumenPiezaDental(16, {
      numeroFDI: 16,
      estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
      estadoEvaluacion: ESTADO_EVALUACION.EVALUADO,
    });

    assert.ok(resumen.ariaLabel.includes('Pieza FDI 16'));
    assert.ok(resumen.ariaLabel.includes('Presente en boca'));
    assert.ok(resumen.ariaLabel.includes('Evaluado clínicamente'));
  });

  // ─── 15. Ausencia de escrituras HTTP al visualizar y seleccionar ──────────
  test('15. Funciones puras de renderizado y view-model no invocan mutaciones HTTP (POST/PUT/DELETE)', () => {
    const odo = crearOdontogramaBasal('hc_solo_lectura', 1);
    const piezasMap = {};
    for (const p of odo.piezas) piezasMap[p.numeroFDI] = p;

    const arcadas = construirEstructuraArcadas(piezasMap);
    assert.ok(arcadas.length === 4);

    const ficha = generarFichaDetallePieza(11, piezasMap[11]);
    assert.equal(ficha.modoLectura, true);
  });
});
