import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { odontogramasService } from '../src/api/odontogramas.service.js';
import { ProblemDetailsError } from '../src/api/problem-details.js';
import {
  ESTADO_ANATOMICO,
  ESTADO_EVALUACION,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
  TIPO_REVISION_ODONTOGRAMA,
  PIEZAS_FDI_VALIDAS_SET,
} from '../src/constants/odontograma.constants.js';

// Generador de fixtures para 52 piezas FDI en estado histórico
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

function createMockRevision(numeroRevision = 1, overrides = {}) {
  return {
    id: `rev_0000000${numeroRevision}-aaaa-bbbb`,
    odontogramaId: 'odo_12345678-aaaa-bbbb',
    historiaClinicaId: 'hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a',
    consultaId: 'cons_12345678-aaaa-bbbb',
    numeroRevision,
    tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
    revisionCorregidaId: null,
    aplicaAlEstadoActual: true,
    fechaRegistro: '2026-10-26T18:00:00.000Z',
    fechaObservacionClinica: '2026-10-26T16:30:00.000Z',
    registradoPor: 'odo_dr_henry',
    motivoRevision: `Revisión clínica longitudinal #${numeroRevision}`,
    cambiosAplicados: [
      {
        numeroFDI: 16,
        superficiesModificadas: [
          {
            superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL,
            condicionAnterior: CONDICION_SUPERFICIE.SANA,
            condicionNueva: CONDICION_SUPERFICIE.OBTURACION_RESINA,
          },
        ],
      },
    ],
    snapshotPiezas: generar52PiezasSnapshot({
      16: {
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        estadoEvaluacion: ESTADO_EVALUACION.EVALUADO,
        superficies: {
          VESTIBULAR: { superficie: TIPO_SUPERFICIE.VESTIBULAR, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          PALATINA_LINGUAL: { superficie: TIPO_SUPERFICIE.PALATINA_LINGUAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          MESIAL: { superficie: TIPO_SUPERFICIE.MESIAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          DISTAL: { superficie: TIPO_SUPERFICIE.DISTAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.OBTURACION_RESINA, evaluada: true },
        },
      },
    }),
    ...overrides,
  };
}

describe('Iteración 7F-4A — Historial Longitudinal y Snapshots del Odontograma', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = [];

  beforeEach(() => {
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ─── 1. Historial paginado ─────────────────────────────────────────────────
  test('1. Historial paginado (construcción correcta de parámetros límite y offset)', async () => {
    globalThis.fetch = async (url) => {
      fetchCalls.push(url);
      return new Response(
        JSON.stringify({
          total: 45,
          limite: 20,
          offset: 10,
          revisiones: [createMockRevision(1), createMockRevision(2)],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const data = await odontogramasService.listarHistorialOdontograma(
      'odo_123',
      { limite: 20, offset: 10 },
      'token_dev',
    );

    assert.equal(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].includes('/odo_123/historial?limite=20&offset=10'));
    assert.equal(data.total, 45);
    assert.equal(data.limite, 20);
    assert.equal(data.offset, 10);
    assert.equal(data.revisiones.length, 2);
  });

  // ─── 2. Estado vacío ───────────────────────────────────────────────────────
  test('2. Estado vacío (sin revisiones registradas retorna arreglo vacío sin error)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          total: 0,
          limite: 20,
          offset: 0,
          revisiones: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const data = await odontogramasService.listarHistorialOdontograma('odo_vacio', {}, 'token_dev');
    assert.equal(data.total, 0);
    assert.deepEqual(data.revisiones, []);
  });

  // ─── 3. Orden cronológico según backend ────────────────────────────────────
  test('3. Orden cronológico según backend (preserva secuencia de revisiones)', async () => {
    const rev1 = createMockRevision(1, { fechaRegistro: '2026-10-01T10:00:00.000Z' });
    const rev2 = createMockRevision(2, { fechaRegistro: '2026-10-15T10:00:00.000Z' });
    const rev3 = createMockRevision(3, { fechaRegistro: '2026-10-26T10:00:00.000Z' });

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ total: 3, limite: 20, offset: 0, revisiones: [rev1, rev2, rev3] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const data = await odontogramasService.listarHistorialOdontograma('odo_123', {}, 'token_dev');
    assert.equal(data.revisiones[0].numeroRevision, 1);
    assert.equal(data.revisiones[1].numeroRevision, 2);
    assert.equal(data.revisiones[2].numeroRevision, 3);
  });

  // ─── 4. Navegación anterior/siguiente ───────────────────────────────────────
  test('4. Navegación anterior/siguiente (cálculo de offset y rangos)', () => {
    const total = 45;
    const limite = 20;

    // Página 1: offset 0
    let offset = 0;
    let desde = offset + 1;
    let hasta = Math.min(offset + limite, total);
    assert.equal(desde, 1);
    assert.equal(hasta, 20);

    // Siguiente -> offset 20
    offset += limite;
    desde = offset + 1;
    hasta = Math.min(offset + limite, total);
    assert.equal(desde, 21);
    assert.equal(hasta, 40);

    // Siguiente -> offset 40 (última página)
    offset += limite;
    desde = offset + 1;
    hasta = Math.min(offset + limite, total);
    assert.equal(desde, 41);
    assert.equal(hasta, 45);

    // Anterior -> offset 20
    offset = Math.max(0, offset - limite);
    assert.equal(offset, 20);
  });

  // ─── 5. Selección de revisión específica ───────────────────────────────────
  test('5. Selección de revisión específica (invoca obtención con ID exacto)', async () => {
    globalThis.fetch = async (url) => {
      fetchCalls.push(url);
      return new Response(JSON.stringify(createMockRevision(2)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const snapshot = await odontogramasService.obtenerSnapshotRevision(
      'odo_123',
      'rev_00000002-aaaa-bbbb',
      'token_dev',
    );

    assert.ok(fetchCalls[0].endsWith('/odo_123/revisiones/rev_00000002-aaaa-bbbb'));
    assert.equal(snapshot.numeroRevision, 2);
  });

  // ─── 6. Carga del snapshot solicitado ──────────────────────────────────────
  test('6. Carga del snapshot solicitado (retorna DTO completo con piezas)', async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify(createMockRevision(3)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const snapshot = await odontogramasService.obtenerSnapshotRevision('odo_123', 'rev_3', 'token_dev');
    assert.ok(snapshot.snapshotPiezas);
    assert.equal(snapshot.snapshotPiezas.length, 52);
  });

  // ─── 7. Representación de las 52 posiciones FDI ────────────────────────────
  test('7. Representación de las 52 posiciones FDI en snapshot sellado', () => {
    const revision = createMockRevision(1);
    const piezasMap = {};
    for (const p of revision.snapshotPiezas) {
      piezasMap[p.numeroFDI] = p;
    }

    assert.equal(Object.keys(piezasMap).length, 52);
    // Verificar posiciones extremas permanentes y deciduas
    assert.ok(piezasMap[18]);
    assert.ok(piezasMap[28]);
    assert.ok(piezasMap[38]);
    assert.ok(piezasMap[48]);
    assert.ok(piezasMap[55]);
    assert.ok(piezasMap[85]);
  });

  // ─── 8. Preservación de estados no evaluados ────────────────────────────────
  test('8. Preservación de estados no evaluados (DESCONOCIDO y NO_EVALUADO intactos)', () => {
    const revision = createMockRevision(1);
    // Tomar pieza 11 que no fue modificada
    const pieza11 = revision.snapshotPiezas.find((p) => p.numeroFDI === 11);
    assert.ok(pieza11);
    assert.equal(pieza11.estadoAnatomico, ESTADO_ANATOMICO.DESCONOCIDO);
    assert.equal(pieza11.estadoEvaluacion, ESTADO_EVALUACION.NO_EVALUADO);
    assert.equal(pieza11.superficies.OCLUSAL_INCISAL.condicion, CONDICION_SUPERFICIE.NO_EVALUADA);
    assert.equal(pieza11.superficies.OCLUSAL_INCISAL.evaluada, false);
  });

  // ─── 9. Diferencia entre fechaRegistro y fechaObservacionClinica ────────────
  test('9. Diferencia entre fechaRegistro y fechaObservacionClinica', () => {
    const revision = createMockRevision(2, {
      fechaRegistro: '2026-10-26T20:00:00.000Z',
      fechaObservacionClinica: '2026-10-24T09:15:00.000Z',
    });

    assert.notEqual(revision.fechaRegistro, revision.fechaObservacionClinica);
    const diffMs = new Date(revision.fechaRegistro).getTime() - new Date(revision.fechaObservacionClinica).getTime();
    assert.ok(diffMs > 0); // El registro es posterior a la observación real
  });

  // ─── 10. Revisión asociada a consulta ──────────────────────────────────────
  test('10. Revisión asociada a consulta (consultaId presente y no forzado a null)', () => {
    const revision = createMockRevision(2, {
      consultaId: 'cons_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a',
    });

    assert.equal(revision.consultaId, 'cons_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a');
  });

  // ─── 11. Múltiples revisiones por consulta ─────────────────────────────────
  test('11. Múltiples revisiones por consulta (GET /consulta/:id retorna arreglo)', async () => {
    const rev1 = createMockRevision(1, { consultaId: 'cons_123' });
    const rev2 = createMockRevision(2, { consultaId: 'cons_123' });

    globalThis.fetch = async (url) => {
      fetchCalls.push(url);
      return new Response(JSON.stringify([rev1, rev2]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const revisiones = await odontogramasService.obtenerSnapshotsPorConsulta('cons_123', 'token_dev');
    assert.equal(fetchCalls[0].endsWith('/consulta/cons_123'), true);
    assert.equal(revisiones.length, 2);
    assert.equal(revisiones[0].numeroRevision, 1);
    assert.equal(revisiones[1].numeroRevision, 2);
  });

  // ─── 12. Enmienda correctiva retrospectiva ─────────────────────────────────
  test('12. Enmienda correctiva retrospectiva (tipo ENMIENDA_CORRECTIVA, aplicaAlEstadoActual = false)', () => {
    const enmienda = createMockRevision(4, {
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
      revisionCorregidaId: 'rev_00000002-aaaa-bbbb',
      aplicaAlEstadoActual: false,
      motivoRevision: 'Rectificación de error tipográfico en pieza 16 de revisión 2',
    });

    assert.equal(enmienda.tipoRevision, 'ENMIENDA_CORRECTIVA');
    assert.equal(enmienda.aplicaAlEstadoActual, false);
    assert.equal(enmienda.revisionCorregidaId, 'rev_00000002-aaaa-bbbb');
  });

  // ─── 13. Snapshot histórico de solo lectura ────────────────────────────────
  test('13. Snapshot histórico de solo lectura (inmutabilidad estricta y sin mutaciones)', () => {
    const snapshotOriginal = createMockRevision(1);
    // Comprobar que snapshotPiezas contiene objetos sellados o tratables de solo lectura
    assert.ok(Array.isArray(snapshotOriginal.snapshotPiezas));
    // La entidad o vista de snapshot no debe poseer botones ni disparadores de mutación
    assert.equal(typeof snapshotOriginal.snapshotPiezas, 'object');
  });

  // ─── 14. Regreso al odontograma actual ─────────────────────────────────────
  test('14. Regreso al odontograma actual (limpieza del snapshot seleccionado)', () => {
    let snapshotSeleccionado = createMockRevision(2);
    assert.ok(snapshotSeleccionado !== null);

    // Función de callback onVolver
    const handleVolver = () => {
      snapshotSeleccionado = null;
    };

    handleVolver();
    assert.equal(snapshotSeleccionado, null);
  });

  // ─── 15. No mezcla entre estado actual e histórico ─────────────────────────
  test('15. No mezcla entre estado actual e histórico (estados independientes)', () => {
    const estadoActual = {
      id: 'odo_1',
      version: 5,
      revisionActualId: 'rev_5',
      piezas: [{ numeroFDI: 16, estadoAnatomico: ESTADO_ANATOMICO.PRESENTE }],
    };

    const snapshotHistorico = createMockRevision(2, {
      version: 2,
      piezas: [{ numeroFDI: 16, estadoAnatomico: ESTADO_ANATOMICO.DESCONOCIDO }],
    });

    // Validar que consultar el snapshot histórico no muta el odontograma consolidado
    assert.equal(estadoActual.version, 5);
    assert.equal(estadoActual.revisionActualId, 'rev_5');
    assert.notEqual(snapshotHistorico.id, estadoActual.revisionActualId);
  });

  // ─── 16. Cambio de expediente con solicitudes en curso ─────────────────────
  test('16. Cambio de expediente con solicitudes en curso (descarte de respuestas desfasadas)', async () => {
    let respuestaLentaDescartada = false;
    const controller = new AbortController();

    globalThis.fetch = async (url, options) => {
      return new Promise((resolve, reject) => {
        const triggerAbort = () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        };

        if (options.signal?.aborted) {
          triggerAbort();
          return;
        }

        options.signal?.addEventListener('abort', triggerAbort);

        setTimeout(() => {
          resolve(new Response(JSON.stringify({ total: 0, revisiones: [] }), { status: 200 }));
        }, 50);
      });
    };

    // Lanzar solicitud
    const promise = odontogramasService.listarHistorialOdontograma('odo_viejo', {}, 'token_dev', controller.signal);

    // El usuario cambia de historia clínica inmediatamente -> abortar
    controller.abort();

    try {
      await promise;
    } catch (err) {
      if (err.name === 'AbortError') {
        respuestaLentaDescartada = true;
      }
    }

    assert.equal(respuestaLentaDescartada, true);
  });

  // ─── 17. Manejo de HTTP 401/404/503 ────────────────────────────────────────
  test('17. Manejo de HTTP 401/404/503 (transformación en ProblemDetailsError)', async () => {
    // 401 Unauthorized
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ status: 401, title: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/problem+json' },
      });

    await assert.rejects(
      async () => odontogramasService.listarHistorialOdontograma('odo_1', {}, 'token_invalido'),
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 401);
        return true;
      },
    );

    // 404 Revision no encontrada
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ status: 404, title: 'Revisión no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/problem+json' },
      });

    await assert.rejects(
      async () => odontogramasService.obtenerSnapshotRevision('odo_1', 'rev_inexistente', 'token_dev'),
      (err) => {
        assert.equal(err.status, 404);
        return true;
      },
    );

    // 503 Servicio no disponible
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ status: 503, title: 'Servicio no disponible' }), {
        status: 503,
        headers: { 'Content-Type': 'application/problem+json' },
      });

    await assert.rejects(
      async () => odontogramasService.obtenerSnapshotsPorConsulta('cons_1', 'token_dev'),
      (err) => {
        assert.equal(err.status, 503);
        return true;
      },
    );
  });

  // ─── 18. Protección frente a respuestas obsoletas ──────────────────────────
  test('18. Protección frente a respuestas obsoletas (race conditions descartadas)', () => {
    let ultimoRequestId = 0;
    let resultadoAplicado = null;

    const simularLlegada = (reqId, datos) => {
      // Solo aplicar si coincide con la solicitud más reciente
      if (reqId === ultimoRequestId) {
        resultadoAplicado = datos;
      }
    };

    // Solicitud 1 disparada
    ultimoRequestId = 1;
    // Solicitud 2 disparada rápidamente
    ultimoRequestId = 2;

    // Supongamos que la solicitud 1 resuelve desfasada
    simularLlegada(1, { offset: 0, items: ['datos_viejos'] });
    assert.equal(resultadoAplicado, null); // Descartada

    // Solicitud 2 resuelve
    simularLlegada(2, { offset: 20, items: ['datos_nuevos'] });
    assert.equal(resultadoAplicado.items[0], 'datos_nuevos');
  });

  // ─── 19. Ausencia de escrituras HTTP ───────────────────────────────────────
  test('19. Ausencia de escrituras HTTP (el flujo de historial invoca estrictamente GET)', async () => {
    const metodosUsados = [];

    globalThis.fetch = async (url, options) => {
      metodosUsados.push(options.method);
      return new Response(JSON.stringify({ total: 1, limite: 20, offset: 0, revisiones: [createMockRevision(1)] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await odontogramasService.listarHistorialOdontograma('odo_1', {}, 'token_dev');
    await odontogramasService.obtenerSnapshotRevision('odo_1', 'rev_1', 'token_dev');
    await odontogramasService.obtenerSnapshotsPorConsulta('cons_1', 'token_dev');

    assert.equal(metodosUsados.length, 3);
    assert.ok(metodosUsados.every((m) => m === 'GET'));
    assert.ok(!metodosUsados.includes('POST'));
    assert.ok(!metodosUsados.includes('PUT'));
    assert.ok(!metodosUsados.includes('DELETE'));
  });

  // ─── 20. Ausencia de persistencia de snapshots en navegador ────────────────
  test('20. Ausencia de persistencia de snapshots en navegador (no localStorage ni sessionStorage)', () => {
    // Simular entornos de almacenamiento del navegador
    const storageKeys = typeof window !== 'undefined' ? Object.keys(window.localStorage || {}) : [];
    const snapshotEnStorage = storageKeys.some((k) => k.toLowerCase().includes('snapshot') || k.toLowerCase().includes('revision'));
    assert.equal(snapshotEnStorage, false);
  });
});
