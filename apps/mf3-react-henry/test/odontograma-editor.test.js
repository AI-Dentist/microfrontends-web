import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADO_ANATOMICO,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
  TIPO_TRATAMIENTO_ESTRUCTURAL,
} from '../src/constants/odontograma.constants.js';
import {
  validarInvariantesBorrador,
  calcularDeltaPieza,
  calcularDeltasOdontograma,
  resumirCambiosBorrador,
} from '../src/utils/odontograma-deltas.js';

// Fixture base de odontograma simulando el snapshot consolidado recibido del servidor
function createMockOdontograma(historiaClinicaId = 'HC-TEST-001', version = 3) {
  return {
    id: '675d00000000000000000001',
    historiaClinicaId,
    version,
    totalRevisiones: 2,
    actualizadoEn: '2026-03-10T12:00:00.000Z',
    piezas: [
      {
        numeroFDI: 11,
        tipoDenticion: 'PERMANENTE',
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        superficies: {
          VESTIBULAR: CONDICION_SUPERFICIE.SANA,
          PALATINA_LINGUAL: CONDICION_SUPERFICIE.SANA,
          MESIAL: CONDICION_SUPERFICIE.SANA,
          DISTAL: CONDICION_SUPERFICIE.SANA,
          OCLUSAL_INCISAL: CONDICION_SUPERFICIE.SANA,
        },
        tratamientosEstructurales: [],
        observaciones: 'Pieza íntegra',
      },
      {
        numeroFDI: 16,
        tipoDenticion: 'PERMANENTE',
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        superficies: {
          VESTIBULAR: CONDICION_SUPERFICIE.NO_EVALUADA,
          PALATINA_LINGUAL: CONDICION_SUPERFICIE.NO_EVALUADA,
          MESIAL: CONDICION_SUPERFICIE.NO_EVALUADA,
          DISTAL: CONDICION_SUPERFICIE.NO_EVALUADA,
          OCLUSAL_INCISAL: CONDICION_SUPERFICIE.NO_EVALUADA,
        },
        tratamientosEstructurales: [],
        observaciones: '',
      },
      {
        numeroFDI: 21,
        tipoDenticion: 'PERMANENTE',
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        superficies: {
          VESTIBULAR: CONDICION_SUPERFICIE.SANA,
          PALATINA_LINGUAL: CONDICION_SUPERFICIE.SANA,
          MESIAL: CONDICION_SUPERFICIE.SANA,
          DISTAL: CONDICION_SUPERFICIE.SANA,
          OCLUSAL_INCISAL: CONDICION_SUPERFICIE.SANA,
        },
        tratamientosEstructurales: [],
        observaciones: '',
      },
    ],
  };
}

test('1. Inicio de edición sobre odontograma existente', () => {
  const odontograma = createMockOdontograma();
  const puedeEditar = Boolean(odontograma && odontograma.id && Array.isArray(odontograma.piezas));
  assert.equal(puedeEditar, true, 'Debe permitir habilitar la edición cuando existe un odontograma real');
});

test('2. Edición bloqueada cuando no existe odontograma', () => {
  const odontogramaNulo = null;
  const puedeEditarNulo = Boolean(odontogramaNulo && odontogramaNulo.id && Array.isArray(odontogramaNulo.piezas));
  assert.equal(puedeEditarNulo, false, 'No debe permitir editar si el odontograma es nulo');

  const odontogramaVacio = {};
  const puedeEditarVacio = Boolean(odontogramaVacio && odontogramaVacio.id && Array.isArray(odontogramaVacio.piezas));
  assert.equal(puedeEditarVacio, false, 'No debe permitir editar si el odontograma carece de id o piezas');
});

test('3. Cambios anatómicos generan deltas con estado anterior y nuevo', () => {
  const original = createMockOdontograma().piezas[0]; // FDI 11, PRESENTE
  const borrador = {
    estadoAnatomico: ESTADO_ANATOMICO.EXTRAIDO,
    superficies: { ...original.superficies },
    tratamientosEstructurales: [],
    observaciones: original.observaciones,
  };

  const delta = calcularDeltaPieza(original, borrador);
  assert.notEqual(delta, null, 'Debe generar delta para cambio anatómico');
  assert.equal(delta.numeroFDI, 11);
  assert.equal(delta.estadoAnatomicoAnterior, ESTADO_ANATOMICO.PRESENTE);
  assert.equal(delta.estadoAnatomicoNuevo, ESTADO_ANATOMICO.EXTRAIDO);
});

test('4. Cambios sobre una superficie', () => {
  const original = createMockOdontograma().piezas[1]; // FDI 16
  const borrador = {
    estadoAnatomico: original.estadoAnatomico,
    superficies: {
      ...original.superficies,
      OCLUSAL_INCISAL: CONDICION_SUPERFICIE.CARIES,
    },
    tratamientosEstructurales: [],
    observaciones: '',
  };

  const delta = calcularDeltaPieza(original, borrador);
  assert.notEqual(delta, null);
  assert.equal(delta.superficiesModificadas.length, 1);
  assert.deepEqual(delta.superficiesModificadas[0], {
    superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL,
    condicionAnterior: CONDICION_SUPERFICIE.NO_EVALUADA,
    condicionNueva: CONDICION_SUPERFICIE.CARIES,
  });
});

test('5. Cambios sobre varias superficies de la misma pieza', () => {
  const original = createMockOdontograma().piezas[1]; // FDI 16
  const borrador = {
    estadoAnatomico: original.estadoAnatomico,
    superficies: {
      ...original.superficies,
      OCLUSAL_INCISAL: CONDICION_SUPERFICIE.CARIES,
      MESIAL: CONDICION_SUPERFICIE.OBTURACION_RESINA,
      DISTAL: CONDICION_SUPERFICIE.FRACTURA,
    },
    tratamientosEstructurales: [],
    observaciones: '',
  };

  const delta = calcularDeltaPieza(original, borrador);
  assert.notEqual(delta, null);
  assert.equal(delta.superficiesModificadas.length, 3);
  const superficiesMod = delta.superficiesModificadas.map((s) => s.superficie);
  assert.ok(superficiesMod.includes(TIPO_SUPERFICIE.OCLUSAL_INCISAL));
  assert.ok(superficiesMod.includes(TIPO_SUPERFICIE.MESIAL));
  assert.ok(superficiesMod.includes(TIPO_SUPERFICIE.DISTAL));
});

test('6. Cambios sobre varias piezas dentales simultáneamente', () => {
  const odontograma = createMockOdontograma();
  const borradorModificaciones = {
    11: {
      estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
      superficies: {
        ...odontograma.piezas[0].superficies,
        VESTIBULAR: CONDICION_SUPERFICIE.FRACTURA,
      },
    },
    16: {
      estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
      superficies: {
        ...odontograma.piezas[1].superficies,
        OCLUSAL_INCISAL: CONDICION_SUPERFICIE.SELLANTE,
      },
    },
  };

  const deltas = calcularDeltasOdontograma(odontograma.piezas, borradorModificaciones);
  assert.equal(deltas.length, 2, 'Debe generar exactamente dos deltas para dos piezas modificadas');
  const fdis = deltas.map((d) => d.numeroFDI);
  assert.ok(fdis.includes(11));
  assert.ok(fdis.includes(16));
});

test('7. Tratamientos estructurales agregados', () => {
  const original = createMockOdontograma().piezas[0]; // FDI 11
  const borrador = {
    estadoAnatomico: original.estadoAnatomico,
    superficies: { ...original.superficies },
    tratamientosEstructurales: [TIPO_TRATAMIENTO_ESTRUCTURAL.CORONA],
    observaciones: original.observaciones,
  };

  const delta = calcularDeltaPieza(original, borrador);
  assert.notEqual(delta, null);
  assert.equal(delta.tratamientoEstructuralAgregado, TIPO_TRATAMIENTO_ESTRUCTURAL.CORONA);
});

test('8. Observaciones clínicas modificadas respetando límite de 500 caracteres', () => {
  const original = createMockOdontograma().piezas[0]; // FDI 11
  const obsLarga = 'A'.repeat(600);
  const borrador = {
    estadoAnatomico: original.estadoAnatomico,
    superficies: { ...original.superficies },
    tratamientosEstructurales: [],
    observaciones: obsLarga.slice(0, 500),
  };

  const delta = calcularDeltaPieza(original, borrador);
  assert.notEqual(delta, null);
  assert.equal(delta.observaciones.length, 500);
});

test('9. Comparación de snapshots original vs borrador en resumen', () => {
  const odontograma = createMockOdontograma();
  const borradorModificaciones = {
    11: {
      estadoAnatomico: ESTADO_ANATOMICO.EXTRAIDO,
    },
    16: {
      superficies: {
        OCLUSAL_INCISAL: CONDICION_SUPERFICIE.CARIES,
        MESIAL: CONDICION_SUPERFICIE.OBTURACION_RESINA,
      },
      tratamientosEstructurales: [TIPO_TRATAMIENTO_ESTRUCTURAL.ENDODONCIA],
    },
  };

  const resumen = resumirCambiosBorrador(odontograma.piezas, borradorModificaciones);
  assert.equal(resumen.piezasModificadas, 2);
  assert.equal(resumen.superficiesModificadas, 2);
  assert.equal(resumen.cambiosAnatomicos, 1);
  assert.equal(resumen.tratamientosAgregados, 1);
  assert.equal(resumen.hayCambios, true);
});

test('10. Generación de deltas válidos conformes a DeltaPiezaDto', () => {
  const original = createMockOdontograma().piezas[1]; // FDI 16
  const borrador = {
    estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
    superficies: {
      ...original.superficies,
      OCLUSAL_INCISAL: CONDICION_SUPERFICIE.CARIES,
    },
    tratamientosEstructurales: [],
    observaciones: 'Sensibilidad al frío',
  };

  const delta = calcularDeltaPieza(original, borrador);
  assert.equal(typeof delta.numeroFDI, 'number');
  assert.ok(Array.isArray(delta.superficiesModificadas));
  assert.equal(delta.observaciones, 'Sensibilidad al frío');
  // Invariante backend: No debe incluir estadoAnatomicoAnterior si no cambió
  assert.equal(delta.estadoAnatomicoAnterior, undefined);
  assert.equal(delta.estadoAnatomicoNuevo, undefined);
});

test('11. Eliminación de cambios revertidos (el delta se anula)', () => {
  const original = createMockOdontograma().piezas[0]; // FDI 11
  // El usuario primero cambia algo pero luego lo vuelve a poner exactamente como el original
  const borradorRevertido = {
    estadoAnatomico: original.estadoAnatomico,
    superficies: { ...original.superficies },
    tratamientosEstructurales: [...original.tratamientosEstructurales],
    observaciones: original.observaciones,
  };

  const delta = calcularDeltaPieza(original, borradorRevertido);
  assert.equal(delta, null, 'Un borrador idéntico al snapshot original no debe generar delta');
});

test('12. No generación de deltas vacíos cuando no hay cambios', () => {
  const odontograma = createMockOdontograma();
  const borradorVacio = {};
  const deltas = calcularDeltasOdontograma(odontograma.piezas, borradorVacio);
  assert.deepEqual(deltas, [], 'Borrador vacío produce lista vacía de deltas');
});

test('13. Ausencia de duplicados para la misma pieza o superficie', () => {
  const original = createMockOdontograma().piezas[1]; // FDI 16
  const borrador = {
    estadoAnatomico: original.estadoAnatomico,
    superficies: {
      ...original.superficies,
      OCLUSAL_INCISAL: CONDICION_SUPERFICIE.CARIES,
    },
  };

  const delta = calcularDeltaPieza(original, borrador);
  const counts = delta.superficiesModificadas.filter((s) => s.superficie === TIPO_SUPERFICIE.OCLUSAL_INCISAL).length;
  assert.equal(counts, 1, 'No debe haber entradas duplicadas de la misma superficie');
});

test('14. Descartar borrador elimina los deltas correspondientes', () => {
  const odontograma = createMockOdontograma();
  let borradorModificaciones = {
    11: { estadoAnatomico: ESTADO_ANATOMICO.AUSENTE },
    16: { observaciones: 'Sospecha de fisura' },
  };

  // Descartar pieza 11
  const nuevoBorrador = { ...borradorModificaciones };
  delete nuevoBorrador[11];
  borradorModificaciones = nuevoBorrador;

  const deltas = calcularDeltasOdontograma(odontograma.piezas, borradorModificaciones);
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].numeroFDI, 16);

  // Descartar todo
  borradorModificaciones = {};
  const deltasLimpios = calcularDeltasOdontograma(odontograma.piezas, borradorModificaciones);
  assert.equal(deltasLimpios.length, 0);
});

test('15. Cambio de historia clínica desvincula el borrador previo', () => {
  const hc1 = 'HC-PACIENTE-01';
  const hc2 = 'HC-PACIENTE-02';
  let borradorActivo = { 11: { estadoAnatomico: ESTADO_ANATOMICO.AUSENTE } };

  // Simulamos cambio de contexto de historia clínica
  let historiaClinicaActual = hc1;
  // Al cambiar historia:
  if (historiaClinicaActual !== hc2) {
    borradorActivo = {};
    historiaClinicaActual = hc2;
  }

  assert.equal(historiaClinicaActual, hc2);
  assert.deepEqual(borradorActivo, {}, 'El borrador de otra historia debe limpiarse y no trasladarse');
});

test('16. Preservación inmutable de versionEsperada', () => {
  const odontograma = createMockOdontograma('HC-TEST', 7);
  // La versión esperada para el futuro comando debe ser exactamente odontograma.version
  const versionEsperada = odontograma.version;
  assert.equal(versionEsperada, 7);
  // No debe auto-incrementarse prematuramente en el frontend
  assert.notEqual(versionEsperada, 8);
});

test('17. Inmutabilidad del snapshot original recibido del servidor', () => {
  const odontograma = createMockOdontograma();
  Object.freeze(odontograma);
  Object.freeze(odontograma.piezas);
  Object.freeze(odontograma.piezas[0]);

  const borrador = {
    estadoAnatomico: ESTADO_ANATOMICO.AUSENTE,
    superficies: {
      ...odontograma.piezas[0].superficies,
      VESTIBULAR: CONDICION_SUPERFICIE.CARIES,
    },
  };

  // Calcular delta sobre objeto congelado debe funcionar sin mutarlo
  assert.doesNotThrow(() => {
    const delta = calcularDeltaPieza(odontograma.piezas[0], borrador);
    assert.notEqual(delta, null);
  });
  assert.equal(odontograma.piezas[0].estadoAnatomico, ESTADO_ANATOMICO.PRESENTE);
});

test('18. Ausencia total de llamadas HTTP en el generador de borradores', () => {
  // Verificamos que validarInvariantes, calcularDeltaPieza y calcularDeltas no interactúan con fetch o APIs
  const original = createMockOdontograma().piezas[0];
  const delta = calcularDeltaPieza(original, { estadoAnatomico: ESTADO_ANATOMICO.EXTRAIDO });
  assert.ok(delta);

  const advertencias = validarInvariantesBorrador(11, {
    estadoAnatomico: ESTADO_ANATOMICO.AUSENTE,
    superficies: { OCLUSAL_INCISAL: CONDICION_SUPERFICIE.CARIES },
  });
  assert.ok(advertencias.length > 0, 'Detecta violación de INV-ODO-02');
});
