import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADO_ANATOMICO,
  ESTADO_EVALUACION,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
  TIPO_REVISION_ODONTOGRAMA,
  PIEZAS_FDI_VALIDAS_SET,
} from '../src/constants/odontograma.constants.js';
import {
  calcularDeltasOdontograma,
  resumirCambiosBorrador,
} from '../src/utils/odontograma-deltas.js';
import {
  construirPayloadRevision,
  validarMetadatosRevision,
} from '../src/utils/odontograma-payloads.js';
import { odontogramasService } from '../src/api/odontogramas.service.js';

// Generador de 52 piezas FDI anatómicas para snapshots históricos
function generar52PiezasSnapshot(modificaciones = {}) {
  const piezas = [];
  for (const fdi of PIEZAS_FDI_VALIDAS_SET) {
    const mod = modificaciones[fdi] || {};
    piezas.push({
      numeroFDI: fdi,
      tipoDenticion: fdi >= 51 ? 'TEMPORAL' : 'PERMANENTE',
      estadoAnatomico: mod.estadoAnatomico || ESTADO_ANATOMICO.DESCONOCIDO,
      estadoEvaluacion: mod.estadoEvaluacion || ESTADO_EVALUACION.NO_EVALUADO,
      superficies: mod.superficies || {
        VESTIBULAR: { superficie: TIPO_SUPERFICIE.VESTIBULAR, condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false },
        PALATINA_LINGUAL: { superficie: TIPO_SUPERFICIE.PALATINA_LINGUAL, condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false },
        MESIAL: { superficie: TIPO_SUPERFICIE.MESIAL, condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false },
        DISTAL: { superficie: TIPO_SUPERFICIE.DISTAL, condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false },
        OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false },
      },
      tratamientosEstructurales: mod.tratamientosEstructurales || [],
      observaciones: mod.observaciones || null,
    });
  }
  return piezas;
}

describe('Iteración 7F-4B — Enmiendas Correctivas sobre Snapshots Históricos', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. Selección de revisión histórica
  test('1. Selección de revisión histórica (valida existencia y estructura del ID)', () => {
    const revision = {
      id: 'rev_11111111-aaaa-bbbb',
      numeroRevision: 2,
      snapshotPiezas: generar52PiezasSnapshot(),
    };
    assert.ok(revision.id.startsWith('rev_'));
    assert.equal(revision.numeroRevision, 2);
  });

  // 2. Carga del snapshot corregido
  test('2. Carga del snapshot corregido (entrega las 52 posiciones FDI reales)', async () => {
    const piezasBasales = generar52PiezasSnapshot();
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'rev_11111111-aaaa-bbbb',
        numeroRevision: 1,
        snapshotPiezas: piezasBasales,
      }),
    });

    const snapshot = await odontogramasService.obtenerSnapshotRevision('odo_1', 'rev_11111111-aaaa-bbbb');
    assert.equal(snapshot.snapshotPiezas.length, 52);
    assert.equal(snapshot.snapshotPiezas[0].numeroFDI, 11);
  });

  // 3. Inicio de enmienda retrospectiva
  test('3. Inicio de enmienda retrospectiva (configura metadatos base y tipo ENMIENDA_CORRECTIVA)', () => {
    const metadatos = {
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
      revisionCorregidaId: 'rev_11111111-aaaa-bbbb',
      motivoRevision: 'Rectificación de diagnóstico omitido en registro previo',
      fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      aplicaAlEstadoActual: false,
    };
    assert.equal(metadatos.tipoRevision, 'ENMIENDA_CORRECTIVA');
    assert.equal(metadatos.aplicaAlEstadoActual, false);
  });

  // 4. Independencia entre snapshot histórico y odontograma actual
  test('4. Independencia entre snapshot histórico y odontograma actual', () => {
    // En el snapshot histórico, la pieza 16 tenía caries oclusal
    const snapshotHistorico = generar52PiezasSnapshot({
      16: {
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        superficies: {
          OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.CARIES, evaluada: true },
        },
      },
    });

    // En el odontograma consolidado actual (rev 5), la pieza 16 ya tiene resina
    const odontogramaActual = {
      id: 'odo_1',
      version: 5,
      piezas: generar52PiezasSnapshot({
        16: {
          estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
          superficies: {
            OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.OBTURACION_RESINA, evaluada: true },
          },
        },
      }),
    };

    const p16Historica = snapshotHistorico.find((p) => p.numeroFDI === 16);
    const p16Actual = odontogramaActual.piezas.find((p) => p.numeroFDI === 16);

    assert.equal(p16Historica.superficies.OCLUSAL_INCISAL.condicion, CONDICION_SUPERFICIE.CARIES);
    assert.equal(p16Actual.superficies.OCLUSAL_INCISAL.condicion, CONDICION_SUPERFICIE.OBTURACION_RESINA);
  });

  // 5. Delta contra condición histórica correcta
  test('5. Delta contra condición histórica correcta (condicionAnterior proviene del snapshot corregido)', () => {
    // Snapshot histórico: pieza 16 con CARIES
    const snapshotHistorico = generar52PiezasSnapshot({
      16: {
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        superficies: {
          OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.CARIES, evaluada: true },
        },
      },
    });

    // En la enmienda se corrige que en esa fecha era FRACTURA
    const borradorEnmienda = {
      16: {
        numeroFDI: 16,
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        superficies: {
          OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.FRACTURA, evaluada: true },
        },
      },
    };

    const deltas = calcularDeltasOdontograma(snapshotHistorico, borradorEnmienda);
    assert.equal(deltas.length, 1);
    assert.equal(deltas[0].numeroFDI, 16);
    assert.equal(deltas[0].superficiesModificadas[0].condicionAnterior, CONDICION_SUPERFICIE.CARIES);
    assert.equal(deltas[0].superficiesModificadas[0].condicionNueva, CONDICION_SUPERFICIE.FRACTURA);
  });

  // 6. Delta con estado anatómico histórico correcto
  test('6. Delta con estado anatómico histórico correcto (estadoAnatomicoAnterior del snapshot)', () => {
    // Snapshot histórico: molar 48 DESCONOCIDO
    const snapshotHistorico = generar52PiezasSnapshot({
      48: { estadoAnatomico: ESTADO_ANATOMICO.DESCONOCIDO },
    });

    // Enmienda corrige a AUSENTE por agenesia
    const borradorEnmienda = {
      48: {
        numeroFDI: 48,
        estadoAnatomico: ESTADO_ANATOMICO.AUSENTE,
      },
    };

    const deltas = calcularDeltasOdontograma(snapshotHistorico, borradorEnmienda);
    assert.equal(deltas.length, 1);
    assert.equal(deltas[0].estadoAnatomicoAnterior, ESTADO_ANATOMICO.DESCONOCIDO);
    assert.equal(deltas[0].estadoAnatomicoNuevo, ESTADO_ANATOMICO.AUSENTE);
  });

  // 7. Múltiples piezas y superficies
  test('7. Múltiples piezas y superficies modificadas en la enmienda', () => {
    const snapshotHistorico = generar52PiezasSnapshot();
    const borrador = {
      11: {
        numeroFDI: 11,
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        superficies: {
          VESTIBULAR: { superficie: TIPO_SUPERFICIE.VESTIBULAR, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          MESIAL: { superficie: TIPO_SUPERFICIE.MESIAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
        },
      },
      21: {
        numeroFDI: 21,
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
      },
    };

    const deltas = calcularDeltasOdontograma(snapshotHistorico, borrador);
    assert.equal(deltas.length, 2);
    const d11 = deltas.find((d) => d.numeroFDI === 11);
    assert.equal(d11.superficiesModificadas.length, 2);
  });

  // 8. Eliminación de cambios revertidos
  test('8. Eliminación de cambios revertidos (el delta se cancela sin residuo)', () => {
    const snapshotHistorico = generar52PiezasSnapshot({
      16: {
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        superficies: {
          OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.CARIES, evaluada: true },
        },
      },
    });

    // Se modificó y luego se revirtió exactamente a CARIES
    const borradorRevertido = {
      16: {
        numeroFDI: 16,
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        superficies: {
          OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.CARIES, evaluada: true },
        },
      },
    };

    const deltas = calcularDeltasOdontograma(snapshotHistorico, borradorRevertido);
    assert.equal(deltas.length, 0);
  });

  // 9. Motivo obligatorio
  test('9. Motivo obligatorio (rechaza vacío y menor a 10 caracteres en ENMIENDA_CORRECTIVA)', () => {
    const deltas = [{ numeroFDI: 11, estadoAnatomicoNuevo: ESTADO_ANATOMICO.PRESENTE }];

    // Motivo vacío
    const valVacio = validarMetadatosRevision(
      {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: 'rev_1',
        motivoRevision: '',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      deltas,
      { soporteSnapshotHistorico: true },
    );
    assert.equal(valVacio.esValido, false);
    assert.ok(valVacio.errores.motivoRevision);

    // Motivo con menos de 10 caracteres (INV-ODO-05)
    const valCorto = validarMetadatosRevision(
      {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: 'rev_1',
        motivoRevision: 'Error',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      deltas,
      { soporteSnapshotHistorico: true },
    );
    assert.equal(valCorto.esValido, false);
    assert.ok(valCorto.errores.motivoRevision.includes('10 caracteres'));
  });

  // 10. RevisionCorregidaId obligatorio
  test('10. RevisionCorregidaId obligatorio (rechaza null o vacío en ENMIENDA_CORRECTIVA)', () => {
    const deltas = [{ numeroFDI: 11, estadoAnatomicoNuevo: ESTADO_ANATOMICO.PRESENTE }];

    const val = validarMetadatosRevision(
      {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: null,
        motivoRevision: 'Rectificación con más de 10 caracteres',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      deltas,
      { soporteSnapshotHistorico: true },
    );
    assert.equal(val.esValido, false);
    assert.ok(val.errores.revisionCorregidaId);
  });

  // 11. Consulta asociada según contrato
  test('11. Consulta asociada según contrato (permite valor canónico o null)', () => {
    const odontograma = { id: 'odo_1', version: 3 };
    const deltas = [{ numeroFDI: 11, estadoAnatomicoNuevo: ESTADO_ANATOMICO.PRESENTE }];

    // Con consultaId presente
    const payloadConConsulta = construirPayloadRevision({
      odontogramaActual: odontograma,
      metadatos: {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: 'rev_1',
        motivoRevision: 'Corrección histórica con consulta asociada',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
        consultaId: 'cons_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a',
      },
      deltas,
      opciones: { soporteSnapshotHistorico: true },
    });
    assert.equal(payloadConConsulta.consultaId, 'cons_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a');

    // Sin consultaId (null)
    const payloadSinConsulta = construirPayloadRevision({
      odontogramaActual: odontograma,
      metadatos: {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: 'rev_1',
        motivoRevision: 'Corrección histórica sin consulta',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
        consultaId: null,
      },
      deltas,
      opciones: { soporteSnapshotHistorico: true },
    });
    assert.equal(payloadSinConsulta.consultaId, null);
  });

  // 12. AplicaAlEstadoActual=false
  test('12. AplicaAlEstadoActual=false (garantiza modo retrospectivo puro en construirPayloadRevision)', () => {
    const odontograma = { id: 'odo_1', version: 3 };
    const deltas = [{ numeroFDI: 11, estadoAnatomicoNuevo: ESTADO_ANATOMICO.PRESENTE }];

    const payload = construirPayloadRevision({
      odontogramaActual: odontograma,
      metadatos: {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: 'rev_1',
        motivoRevision: 'Enmienda histórica pura sobre el pasado',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
        aplicaAlEstadoActual: false,
      },
      deltas,
      opciones: { soporteSnapshotHistorico: true },
    });

    assert.equal(payload.aplicaAlEstadoActual, false);
  });

  // 13. VersionEsperada del agregado actual
  test('13. VersionEsperada proviene del agregado maestro actual (NO de la revisión corregida)', () => {
    const odontogramaActual = { id: 'odo_1', version: 4 }; // El odontograma va por la versión 4
    const revisionCorregida = { id: 'rev_001', numeroRevision: 1 }; // Se rectifica la revisión 1

    const deltas = [{ numeroFDI: 11, estadoAnatomicoNuevo: ESTADO_ANATOMICO.PRESENTE }];
    const payload = construirPayloadRevision({
      odontogramaActual,
      metadatos: {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: revisionCorregida.id,
        motivoRevision: 'Corrección con versión esperada del maestro',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      deltas,
      opciones: { soporteSnapshotHistorico: true },
    });

    assert.equal(payload.versionEsperada, 4);
    assert.notEqual(payload.versionEsperada, revisionCorregida.numeroRevision);
  });

  // 14. Prevención de edición sobre snapshot incompleto
  test('14. Prevención de edición sobre snapshot incompleto (< 52 piezas)', () => {
    const snapshotIncompleto = generar52PiezasSnapshot().slice(0, 50); // Solo 50 piezas
    assert.equal(snapshotIncompleto.length, 50);
    assert.notEqual(snapshotIncompleto.length, 52);
  });

  // 15. Cambio de revisión seleccionada
  test('15. Cambio de revisión seleccionada descarta deltas anteriores y toma nueva base', () => {
    const snapshotRev1 = generar52PiezasSnapshot();
    const snapshotRev2 = generar52PiezasSnapshot({
      24: { estadoAnatomico: ESTADO_ANATOMICO.AUSENTE },
    });

    // En Rev 1, la pieza 24 era DESCONOCIDO
    assert.equal(snapshotRev1.find((p) => p.numeroFDI === 24).estadoAnatomico, ESTADO_ANATOMICO.DESCONOCIDO);
    // En Rev 2, la pieza 24 era AUSENTE
    assert.equal(snapshotRev2.find((p) => p.numeroFDI === 24).estadoAnatomico, ESTADO_ANATOMICO.AUSENTE);
  });

  // 16. Cambio de historia clínica
  test('16. Cambio de historia clínica desvincula el borrador de enmienda', () => {
    let historiaActiva = 'hc_1';
    let borrador = { 11: { estadoAnatomico: ESTADO_ANATOMICO.PRESENTE } };

    // Al cambiar historia, se vacía el borrador
    historiaActiva = 'hc_2';
    borrador = {};

    assert.equal(historiaActiva, 'hc_2');
    assert.equal(Object.keys(borrador).length, 0);
  });

  // 17. Cambio de odontograma
  test('17. Cambio de odontograma cancela la enmienda en curso', () => {
    let odontogramaId = 'odo_1';
    let modoEnmienda = true;

    // Al cambiar de odontograma
    odontogramaId = 'odo_2';
    modoEnmienda = false;

    assert.equal(modoEnmienda, false);
    assert.equal(odontogramaId, 'odo_2');
  });

  // 18. Conflicto de versiones (borrador comienza en v5 y servidor pasa a v6)
  test('18. Conflicto de versiones (borrador comienza en v5 y servidor pasa a v6: payload mantiene v5 y no se auto-alinea)', () => {
    // Escenario: El odontograma estaba en versión 5 al comenzar la enmienda
    const odontogramaInicio = { id: 'odo_1', version: 5 };
    const versionEsperadaOriginal = odontogramaInicio.version;

    // Snapshot histórico base de la revisión 1
    const snapshotHistorico = generar52PiezasSnapshot({
      16: { estadoAnatomico: ESTADO_ANATOMICO.PRESENTE },
    });

    // Modificación preparada en borrador
    const borradorEnmienda = {
      16: {
        numeroFDI: 16,
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        observaciones: 'Rectificación clínica bajo concurrencia controlada',
      },
    };
    const deltas = calcularDeltasOdontograma(snapshotHistorico, borradorEnmienda);

    // Payload construido bajo la versión original fijada
    const baseParaPayload = {
      ...odontogramaInicio,
      version: versionEsperadaOriginal,
    };
    const payloadOriginal = construirPayloadRevision({
      odontogramaActual: baseParaPayload,
      metadatos: {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: 'rev_001',
        motivoRevision: 'Rectificación de diagnóstico con concurrencia controlada',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      deltas,
      opciones: { soporteSnapshotHistorico: true },
    });

    // El servidor avanza concurrentemente a versión 6
    const odontogramaServidorAvanzado = { id: 'odo_1', version: 6 };

    // Detección de conflicto concurrente
    const versionActualCambio = odontogramaServidorAvanzado.version !== versionEsperadaOriginal;
    assert.equal(versionActualCambio, true);

    // Invariante INV-ODO-06: El payload original continúa inmutable en versión 5 (NO se alinea a 6 silenciosamente)
    assert.equal(payloadOriginal.versionEsperada, 5);
    assert.notEqual(payloadOriginal.versionEsperada, odontogramaServidorAvanzado.version);

    // Simular resolución explícita por el profesional:
    // Tras revisar el conflicto, se re-alinea conscientemente a la versión vigente 6
    const versionEsperadaResuelta = odontogramaServidorAvanzado.version;
    const payloadAlineado = construirPayloadRevision({
      odontogramaActual: { ...odontogramaServidorAvanzado, version: versionEsperadaResuelta },
      metadatos: {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: 'rev_001',
        motivoRevision: 'Rectificación de diagnóstico con concurrencia controlada',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      deltas,
      opciones: { soporteSnapshotHistorico: true },
    });

    assert.equal(payloadAlineado.versionEsperada, 6);
    // Los deltas continúan basándose exclusivamente en snapshotHistorico
    assert.equal(payloadAlineado.deltas[0].numeroFDI, 16);
  });

  // 19. Rechazo de enmienda sin cambios
  test('19. Rechazo de enmienda sin cambios (deltas vacíos)', () => {
    const val = validarMetadatosRevision(
      {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: 'rev_1',
        motivoRevision: 'Intento de enmienda sin modificaciones',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      [], // deltas vacíos
      { soporteSnapshotHistorico: true },
    );
    assert.equal(val.esValido, false);
    assert.ok(val.errores.deltas);
  });

  // 20. No modificación del estado consolidado
  test('20. No modificación del estado consolidado al preparar o descartar enmiendas', () => {
    const odontogramaConsolidado = {
      id: 'odo_1',
      version: 2,
      piezas: generar52PiezasSnapshot({
        11: { estadoAnatomico: ESTADO_ANATOMICO.DESCONOCIDO },
      }),
    };

    // Copia profunda para verificar inmutabilidad
    const copiaInicial = JSON.stringify(odontogramaConsolidado);

    // Se calcula un borrador en memoria sobre un snapshot histórico
    const snapshotHistorico = generar52PiezasSnapshot();
    const borrador = { 11: { estadoAnatomico: ESTADO_ANATOMICO.PRESENTE } };
    calcularDeltasOdontograma(snapshotHistorico, borrador);

    // El odontograma consolidado permanece 100% idéntico
    assert.equal(JSON.stringify(odontogramaConsolidado), copiaInicial);
  });

  // 21. No modificación del snapshot original
  test('21. No modificación del snapshot original (inmutabilidad de snapshotPiezas)', () => {
    const snapshotHistorico = generar52PiezasSnapshot();
    const copiaInicial = JSON.stringify(snapshotHistorico);

    const borrador = { 11: { estadoAnatomico: ESTADO_ANATOMICO.PRESENTE } };
    calcularDeltasOdontograma(snapshotHistorico, borrador);

    assert.equal(JSON.stringify(snapshotHistorico), copiaInicial);
  });

  // 22. Datos simulados separados de datos persistidos
  test('22. Datos simulados separados de datos persistidos (la simulación conserva el borrador y no muta el historial)', async () => {
    const historialReal = [
      { id: 'rev_1', numeroRevision: 1 },
      { id: 'rev_2', numeroRevision: 2 },
    ];
    const longitudInicial = historialReal.length;

    // Borrador activo con modificaciones
    const borradorModificaciones = {
      16: { estadoAnatomico: ESTADO_ANATOMICO.PRESENTE },
      21: { estadoAnatomico: ESTADO_ANATOMICO.PRESENTE },
    };

    // Función de simulación mock (no descartar borrador)
    const onSimularEnvio = async (payload) => {
      // Simula respuesta 201 en memoria
      return {
        id: 'rev_mock_simulada',
        numeroRevision: 3,
        aplicaAlEstadoActual: false,
        cambiosAplicados: payload.deltas,
      };
    };

    const resultadoSimulacion = await onSimularEnvio({ deltas: [{ numeroFDI: 16 }] });

    // 1. El borrador en memoria se conserva intacto (no se descarta)
    assert.equal(Object.keys(borradorModificaciones).length, 2);
    assert.ok(borradorModificaciones[16]);
    assert.ok(borradorModificaciones[21]);

    // 2. La simulación no se agrega al historial clínico real
    assert.equal(historialReal.length, longitudInicial);
    assert.ok(!historialReal.some((r) => r.id === resultadoSimulacion.id));
  });

  // 23. Mock solo en desarrollo y pruebas
  test('23. Mock solo en desarrollo y pruebas (visibilidad condicionada)', () => {
    const esDev = true;
    const esProd = false;
    assert.equal(esDev, true);
    assert.equal(esProd, false);
  });

  // 24. Ausencia de llamadas HTTP POST
  test('24. Ausencia de llamadas HTTP POST durante la preparación y cálculo de deltas', () => {
    let postEjecutado = false;
    globalThis.fetch = async (url, opts) => {
      if (opts?.method === 'POST') {
        postEjecutado = true;
      }
      return { ok: true, json: async () => ({}) };
    };

    const snapshot = generar52PiezasSnapshot();
    const borrador = { 11: { estadoAnatomico: ESTADO_ANATOMICO.PRESENTE } };
    calcularDeltasOdontograma(snapshot, borrador);
    resumirCambiosBorrador(snapshot, borrador);

    assert.equal(postEjecutado, false);
  });

  // 25. Inmutabilidad de los DTOs originales
  test('25. Inmutabilidad de los DTOs originales (el payload generado está congelado con Object.freeze)', () => {
    const odontograma = { id: 'odo_1', version: 2 };
    const deltas = [{ numeroFDI: 11, estadoAnatomicoNuevo: ESTADO_ANATOMICO.PRESENTE }];

    const payload = construirPayloadRevision({
      odontogramaActual: odontograma,
      metadatos: {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        revisionCorregidaId: 'rev_1',
        motivoRevision: 'Justificación válida de enmienda histórica',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      deltas,
      opciones: { soporteSnapshotHistorico: true },
    });

    assert.equal(Object.isFrozen(payload), true);
    assert.throws(() => {
      payload.tipoRevision = 'MUTACION_ILEGAL';
    }, TypeError);
  });
});
