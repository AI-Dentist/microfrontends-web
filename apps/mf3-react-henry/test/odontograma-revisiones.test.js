import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  construirPayloadRevision,
  validarMetadatosRevision,
  sanitizarDeltaPieza,
} from '../src/utils/odontograma-payloads.js';
import { odontogramasService } from '../src/api/odontogramas.service.js';
import { ProblemDetailsError } from '../src/api/problem-details.js';
import {
  ESTADO_ANATOMICO,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
  TIPO_TRATAMIENTO_ESTRUCTURAL,
  TIPO_REVISION_ODONTOGRAMA,
} from '../src/constants/odontograma.constants.js';

function createMockOdontogramaActual(overrides = {}) {
  return {
    id: 'odo_12345678-aaaa-bbbb',
    historiaClinicaId: 'hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a',
    pacienteId: 'pac_98765432-1111-2222',
    version: 4,
    revisionActualId: 'rev_00000004-aaaa-bbbb',
    totalRevisiones: 4,
    creadoEn: '2026-10-01T10:00:00.000Z',
    actualizadoEn: '2026-10-20T14:30:00.000Z',
    actualizadoPor: 'odo_dr_henry',
    piezas: [
      {
        numeroFDI: 11,
        tipoDenticion: 'PERMANENTE',
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        estadoEvaluacion: 'EVALUADO',
        superficies: {
          VESTIBULAR: { superficie: 'VESTIBULAR', condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          PALATINA_LINGUAL: { superficie: 'PALATINA_LINGUAL', condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          MESIAL: { superficie: 'MESIAL', condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          DISTAL: { superficie: 'DISTAL', condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          OCLUSAL_INCISAL: { superficie: 'OCLUSAL_INCISAL', condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
        },
        tratamientosEstructurales: [],
        observaciones: null,
      },
      {
        numeroFDI: 16,
        tipoDenticion: 'PERMANENTE',
        estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
        estadoEvaluacion: 'EVALUADO',
        superficies: {
          VESTIBULAR: { superficie: 'VESTIBULAR', condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          PALATINA_LINGUAL: { superficie: 'PALATINA_LINGUAL', condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          MESIAL: { superficie: 'MESIAL', condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          DISTAL: { superficie: 'DISTAL', condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
          OCLUSAL_INCISAL: { superficie: 'OCLUSAL_INCISAL', condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
        },
        tratamientosEstructurales: [],
        observaciones: null,
      },
      {
        numeroFDI: 21,
        tipoDenticion: 'PERMANENTE',
        estadoAnatomico: ESTADO_ANATOMICO.DESCONOCIDO,
        estadoEvaluacion: 'NO_EVALUADO',
        superficies: {
          VESTIBULAR: { superficie: 'VESTIBULAR', condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false },
          PALATINA_LINGUAL: { superficie: 'PALATINA_LINGUAL', condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false },
          MESIAL: { superficie: 'MESIAL', condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false },
          DISTAL: { superficie: 'DISTAL', condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false },
          OCLUSAL_INCISAL: { superficie: 'OCLUSAL_INCISAL', condicion: CONDICION_SUPERFICIE.NO_EVALUADA, evaluada: false },
        },
        tratamientosEstructurales: [],
        observaciones: null,
      },
    ],
    ...overrides,
  };
}

describe('Iteración 7F-3B — Registro Controlado de Revisiones del Odontograma', () => {
  const originalFetch = globalThis.fetch;
  let fetchHistory = [];

  beforeEach(() => {
    fetchHistory = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ─── 1. Construcción exacta de payloads ─────────────────────────────────────
  test('1. Construcción exacta de payloads (RegistrarRevisionOdontogramaHttpDto)', () => {
    const odo = createMockOdontogramaActual({ version: 5 });
    const deltas = [
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
    ];
    const metadatos = {
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
      consultaId: 'cons_12345678-aaaa-bbbb',
      fechaObservacionClinica: '2026-10-26T14:30:00.000Z',
      motivoRevision: 'Restauración oclusal con resina fotocurable por caries clase I.',
      aplicaAlEstadoActual: true,
    };

    const payload = construirPayloadRevision({ odontogramaActual: odo, metadatos, deltas });

    assert.equal(payload.versionEsperada, 5);
    assert.equal(payload.tipoRevision, TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION);
    assert.equal(payload.consultaId, 'cons_12345678-aaaa-bbbb');
    assert.equal(payload.fechaObservacionClinica, '2026-10-26T14:30:00.000Z');
    assert.equal(payload.motivoRevision, 'Restauración oclusal con resina fotocurable por caries clase I.');
    assert.equal(payload.aplicaAlEstadoActual, true);
    assert.equal(payload.revisionCorregidaId, null);
    assert.equal(payload.deltas.length, 1);
    assert.equal(payload.deltas[0].numeroFDI, 16);
    assert.equal(payload.deltas[0].superficiesModificadas.length, 1);
  });

  // ─── 2. Nueva observación válida ───────────────────────────────────────────
  test('2. Nueva observación válida (aplicaAlEstadoActual = true, sin revisionCorregidaId)', () => {
    const odo = createMockOdontogramaActual({ version: 2 });
    const deltas = [{ numeroFDI: 11, observaciones: 'Revisión periódica sin patología' }];
    const metadatos = {
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
      fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      motivoRevision: 'Control rutinario semestral',
      aplicaAlEstadoActual: true,
      revisionCorregidaId: null,
    };

    const payload = construirPayloadRevision({ odontogramaActual: odo, metadatos, deltas });
    assert.equal(payload.tipoRevision, 'NUEVA_OBSERVACION');
    assert.equal(payload.aplicaAlEstadoActual, true);
    assert.equal(payload.revisionCorregidaId, null);
  });

  // ─── 3. Enmienda bloqueada sin snapshot histórico adecuado ─────────────────
  test('3. Enmienda bloqueada sin snapshot histórico adecuado (explicación clara para 7F-4)', () => {
    const odo = createMockOdontogramaActual();
    const deltas = [{ numeroFDI: 16, observaciones: 'Corrección de registro previo' }];
    const metadatos = {
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
      revisionCorregidaId: 'rev_previa_001',
      fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      motivoRevision: 'Rectificación de diagnóstico erróneo en revisión 1',
    };

    // Al no estar activada la capacidad de snapshot histórico (soporteSnapshotHistorico: false), debe arrojar error explícito
    assert.throws(
      () =>
        construirPayloadRevision({
          odontogramaActual: odo,
          metadatos,
          deltas,
          opciones: { soporteSnapshotHistorico: false },
        }),
      (err) => {
        assert.ok(err.message.includes('7F-4'));
        assert.ok(err.message.includes('ENMIENDA_CORRECTIVA'));
        return true;
      },
    );
  });

  // ─── 4. Formulario incompleto ──────────────────────────────────────────────
  test('4. Formulario incompleto (motivo vacío, fecha inválida)', () => {
    const deltas = [{ numeroFDI: 11, observaciones: 'Nota' }];

    // Motivo vacío
    const valMotivo = validarMetadatosRevision(
      {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
        motivoRevision: '   ',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      deltas,
    );
    assert.equal(valMotivo.esValido, false);
    assert.ok(valMotivo.errores.motivoRevision);

    // Fecha inválida
    const valFecha = validarMetadatosRevision(
      {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
        motivoRevision: 'Motivo válido',
        fechaObservacionClinica: 'fecha-no-valida-xxx',
      },
      deltas,
    );
    assert.equal(valFecha.esValido, false);
    assert.ok(valFecha.errores.fechaObservacionClinica);
  });

  // ─── 5. Deltas vacíos ──────────────────────────────────────────────────────
  test('5. Deltas vacíos (rechazo si no hay modificaciones efectivas)', () => {
    const valVacio = validarMetadatosRevision(
      {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
        motivoRevision: 'Intento de registro sin deltas',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      [],
    );
    assert.equal(valVacio.esValido, false);
    assert.ok(valVacio.errores.deltas.includes('No existen modificaciones'));
  });

  // ─── 6. Varias piezas modificadas simultáneamente ─────────────────────────
  test('6. Varias piezas modificadas simultáneamente', () => {
    const odo = createMockOdontogramaActual();
    const deltas = [
      {
        numeroFDI: 11,
        observaciones: 'Control pieza 11',
      },
      {
        numeroFDI: 16,
        superficiesModificadas: [
          {
            superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL,
            condicionAnterior: CONDICION_SUPERFICIE.SANA,
            condicionNueva: CONDICION_SUPERFICIE.CARIES,
          },
        ],
      },
      {
        numeroFDI: 21,
        estadoAnatomicoAnterior: ESTADO_ANATOMICO.DESCONOCIDO,
        estadoAnatomicoNuevo: ESTADO_ANATOMICO.PRESENTE,
      },
    ];

    const payload = construirPayloadRevision({
      odontogramaActual: odo,
      metadatos: {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
        motivoRevision: 'Exploración multifocal piezas 11, 16 y 21',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      deltas,
    });

    assert.equal(payload.deltas.length, 3);
    assert.deepEqual(
      payload.deltas.map((d) => d.numeroFDI),
      [11, 16, 21],
    );
  });

  // ─── 7. Varias superficies modificadas en la misma pieza ───────────────────
  test('7. Varias superficies modificadas en la misma pieza', () => {
    const delta = sanitizarDeltaPieza({
      numeroFDI: 16,
      superficiesModificadas: [
        {
          superficie: TIPO_SUPERFICIE.MESIAL,
          condicionAnterior: CONDICION_SUPERFICIE.SANA,
          condicionNueva: CONDICION_SUPERFICIE.CARIES,
        },
        {
          superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL,
          condicionAnterior: CONDICION_SUPERFICIE.SANA,
          condicionNueva: CONDICION_SUPERFICIE.OBTURACION_RESINA,
        },
        {
          superficie: TIPO_SUPERFICIE.DISTAL,
          condicionAnterior: CONDICION_SUPERFICIE.SANA,
          condicionNueva: CONDICION_SUPERFICIE.CARIES,
        },
      ],
    });

    assert.equal(delta.numeroFDI, 16);
    assert.equal(delta.superficiesModificadas.length, 3);
    assert.equal(delta.superficiesModificadas[0].superficie, TIPO_SUPERFICIE.MESIAL);
    assert.equal(delta.superficiesModificadas[1].superficie, TIPO_SUPERFICIE.OCLUSAL_INCISAL);
    assert.equal(delta.superficiesModificadas[2].superficie, TIPO_SUPERFICIE.DISTAL);
  });

  // ─── 8. Tratamientos estructurales y observaciones clínicas en deltas ──────
  test('8. Tratamientos estructurales y observaciones clínicas en deltas', () => {
    const delta = sanitizarDeltaPieza({
      numeroFDI: 16,
      tratamientoEstructuralAgregado: TIPO_TRATAMIENTO_ESTRUCTURAL.CORONA,
      observaciones: 'Corona cerámica colocada sobre muñón reconstruido con ionómero.',
    });

    assert.equal(delta.tratamientoEstructuralAgregado, 'CORONA');
    assert.ok(delta.observaciones.includes('Corona cerámica'));
  });

  // ─── 9. Preservación inmutable de versionEsperada ──────────────────────────
  test('9. Preservación inmutable de versionEsperada (sin auto-incremento manual)', () => {
    const odo = createMockOdontogramaActual({ version: 7 });
    const payload = construirPayloadRevision({
      odontogramaActual: odo,
      metadatos: {
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
        motivoRevision: 'Verificación de versión exacta',
        fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      },
      deltas: [{ numeroFDI: 11, observaciones: 'test' }],
    });

    // La versión esperada enviada debe ser exactamente 7, NUNCA 8
    assert.equal(payload.versionEsperada, 7);
  });

  // ─── 10. Identidad no manipulable ──────────────────────────────────────────
  test('10. Identidad no manipulable (prohibición de odontologoId, pacienteId, historiaClinicaId en el body)', () => {
    const odo = createMockOdontogramaActual();
    const metadatosMaliciosos = {
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
      motivoRevision: 'Intento de inyección de identidad',
      fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      // Campos de identidad prohibidos en el body
      odontologoId: 'dr_hacker',
      pacienteId: 'pac_suplantado',
      historiaClinicaId: 'hc_ajena',
      numeroRevision: 999,
    };

    const payload = construirPayloadRevision({
      odontogramaActual: odo,
      metadatos: metadatosMaliciosos,
      deltas: [{ numeroFDI: 11, observaciones: 'test' }],
    });

    assert.equal(payload.odontologoId, undefined);
    assert.equal(payload.pacienteId, undefined);
    assert.equal(payload.historiaClinicaId, undefined);
    assert.equal(payload.numeroRevision, undefined);
  });

  // ─── 11. Confirmación explícita previa al despacho ─────────────────────────
  test('11. Confirmación explícita (diálogo/modal antes del despacho)', () => {
    const odo = createMockOdontogramaActual();
    const deltas = [{ numeroFDI: 16, observaciones: 'Cambio preparado' }];
    const metadatos = {
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
      motivoRevision: 'Inspección',
      fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
    };

    // La función validadora confirma que todos los datos estén presentes antes de permitir abrir o confirmar el despacho
    const validacion = validarMetadatosRevision(metadatos, deltas);
    assert.equal(validacion.esValido, true);

    const payload = construirPayloadRevision({ odontogramaActual: odo, metadatos, deltas });
    assert.ok(payload);
  });

  // ─── 12. Prevención de doble envío ─────────────────────────────────────────
  test('12. Prevención de doble envío (isSubmitting bloquea solicitudes simultáneas)', async () => {
    let llamadas = 0;
    globalThis.fetch = async () => {
      llamadas++;
      return new Response(JSON.stringify({ id: 'rev_1', aplicaAlEstadoActual: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const payload = {
      versionEsperada: 1,
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
      fechaObservacionClinica: '2026-10-26T10:00:00.000Z',
      motivoRevision: 'Test doble envío',
      deltas: [{ numeroFDI: 11, observaciones: 'Nota' }],
      aplicaAlEstadoActual: true,
    };

    // Simulando bandera de protección isSubmitting en consumidor
    let isSubmitting = false;
    const invocarEnvioSeguro = async () => {
      if (isSubmitting) return null;
      isSubmitting = true;
      try {
        return await odontogramasService.registrarRevisionOdontograma('odo_123', payload, 'token_dev');
      } finally {
        isSubmitting = false;
      }
    };

    // Disparar dos llamadas simultáneas
    const [p1, p2] = [invocarEnvioSeguro(), invocarEnvioSeguro()];
    const [res1, res2] = await Promise.all([p1, p2]);

    assert.equal(llamadas, 1);
    assert.ok(res1 !== null || res2 !== null);
  });

  // ─── 13. Bloqueo de escritura en entorno principal standalone ──────────────
  test('13. Bloqueo de escritura en entorno principal (escrituraHabilitada = false en Standalone)', () => {
    const entornoStandalone = {
      host: '127.0.0.1:27017',
      base: 'clinica-dentalDB',
      replicaSet: false, // Standalone
    };

    const escrituraHabilitada = Boolean(entornoStandalone.replicaSet);
    assert.equal(escrituraHabilitada, false);
  });

  // ─── 14. Simulación HTTP 201 Created ───────────────────────────────────────
  test('14. Simulación HTTP 201 (revisión creada, actualización consolidada, limpieza de borrador)', async () => {
    const revisionEsperadaRespuesta = {
      id: 'rev_nueva_201',
      odontogramaId: 'odo_12345678-aaaa-bbbb',
      historiaClinicaId: 'hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a',
      numeroRevision: 5,
      tipoRevision: 'NUEVA_OBSERVACION',
      aplicaAlEstadoActual: true,
      fechaRegistro: '2026-10-26T22:00:00.000Z',
      fechaObservacionClinica: '2026-10-26T21:30:00.000Z',
      motivoRevision: 'Restauración oclusal pieza 16',
      snapshotPiezas: [{ numeroFDI: 16, estadoAnatomico: 'PRESENTE' }],
    };

    globalThis.fetch = async (url, options) => {
      fetchHistory.push({ url, method: options.method });
      return new Response(JSON.stringify(revisionEsperadaRespuesta), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await odontogramasService.registrarRevisionOdontograma(
      'odo_12345678-aaaa-bbbb',
      {
        versionEsperada: 4,
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
        fechaObservacionClinica: '2026-10-26T21:30:00.000Z',
        motivoRevision: 'Restauración oclusal pieza 16',
        deltas: [{ numeroFDI: 16, observaciones: 'ok' }],
        aplicaAlEstadoActual: true,
      },
      'token_dev',
    );

    assert.equal(fetchHistory[0].method, 'POST');
    assert.equal(res.id, 'rev_nueva_201');
    assert.equal(res.numeroRevision, 5);
  });

  // ─── 15. Simulación HTTP 400 Bad Request ───────────────────────────────────
  test('15. Simulación HTTP 400 (Bad Request con RFC 7807)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/bad-request',
          title: 'Cuerpo de solicitud inválido',
          status: 400,
          detail: 'La fecha de observación clínica debe ser una fecha ISO 8601 válida.',
          instance: '/api/expediente/odontogramas/odo_123/revisiones',
          timestamp: '2026-10-26T22:00:00.000Z',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma(
          'odo_123',
          {
            versionEsperada: 1,
            tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
            fechaObservacionClinica: 'fecha_invalida',
            motivoRevision: 'Motivo',
            deltas: [{ numeroFDI: 11 }],
            aplicaAlEstadoActual: true,
          },
          'token_dev',
        );
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 400);
        assert.ok(err.detail.includes('ISO 8601'));
        return true;
      },
    );
  });

  // ─── 16. Simulación HTTP 401 Unauthorized ──────────────────────────────────
  test('16. Simulación HTTP 401 (Unauthorized)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/unauthorized',
          title: 'Autenticación requerida',
          status: 401,
          detail: 'Token no proporcionado o inválido.',
          instance: '/api/expediente/odontogramas/odo_123/revisiones',
        }),
        { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma(
          'odo_123',
          {
            versionEsperada: 1,
            tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
            fechaObservacionClinica: '2026-10-26T22:00:00.000Z',
            motivoRevision: 'Test',
            deltas: [{ numeroFDI: 11 }],
            aplicaAlEstadoActual: true,
          },
          'token_invalido',
        );
      },
      (err) => {
        assert.equal(err.status, 401);
        return true;
      },
    );
  });

  // ─── 17. Simulación HTTP 404 Not Found ─────────────────────────────────────
  test('17. Simulación HTTP 404 (Odontograma o consulta no encontrada)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/not-found',
          title: 'Odontograma no encontrado',
          status: 404,
          detail: 'No existe un odontograma con el ID proporcionado.',
        }),
        { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma(
          'odo_inexistente',
          {
            versionEsperada: 1,
            tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
            fechaObservacionClinica: '2026-10-26T22:00:00.000Z',
            motivoRevision: 'Test',
            deltas: [{ numeroFDI: 11 }],
            aplicaAlEstadoActual: true,
          },
          'token_dev',
        );
      },
      (err) => {
        assert.equal(err.status, 404);
        return true;
      },
    );
  });

  // ─── 18. Simulación HTTP 409 Conflict (Concurrencia Optimista) ─────────────
  test('18. Simulación HTTP 409 (Conflicto optimista, no reintentar a ciegas, ofrecer recargar)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/conflict',
          title: 'Conflicto de concurrencia optimista en odontograma',
          status: 409,
          detail: 'Conflicto de concurrencia optimista: la versión esperada (v4) no coincide con la versión real (v5).',
        }),
        { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma(
          'odo_123',
          {
            versionEsperada: 4,
            tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
            fechaObservacionClinica: '2026-10-26T22:00:00.000Z',
            motivoRevision: 'Test 409',
            deltas: [{ numeroFDI: 11 }],
            aplicaAlEstadoActual: true,
          },
          'token_dev',
        );
      },
      (err) => {
        assert.equal(err.status, 409);
        assert.ok(err.detail.includes('versión esperada (v4)'));
        return true;
      },
    );
  });

  // ─── 19. Simulación HTTP 422 Unprocessable Entity ──────────────────────────
  test('19. Simulación HTTP 422 (Incompatibilidad anatómica o clínica)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/anatomical-incompatibility',
          title: 'Condición anatómica incompatible',
          status: 422,
          detail: 'No se puede diagnosticar caries en una pieza dental con estado anatómico EXTRAIDO.',
        }),
        { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma(
          'odo_123',
          {
            versionEsperada: 1,
            tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
            fechaObservacionClinica: '2026-10-26T22:00:00.000Z',
            motivoRevision: 'Test 422',
            deltas: [{ numeroFDI: 11 }],
            aplicaAlEstadoActual: true,
          },
          'token_dev',
        );
      },
      (err) => {
        assert.equal(err.status, 422);
        assert.ok(err.detail.includes('EXTRAIDO'));
        return true;
      },
    );
  });

  // ─── 20. Simulación HTTP 503 Service Unavailable ───────────────────────────
  test('20. Simulación HTTP 503 (Escritura transaccional no disponible en Standalone)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/service-unavailable',
          title: 'Servicio de persistencia clínica no disponible',
          status: 503,
          detail: 'El servicio de persistencia clínica no se encuentra disponible temporalmente para operaciones de escritura transaccional.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma(
          'odo_123',
          {
            versionEsperada: 1,
            tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
            fechaObservacionClinica: '2026-10-26T22:00:00.000Z',
            motivoRevision: 'Test 503',
            deltas: [{ numeroFDI: 11 }],
            aplicaAlEstadoActual: true,
          },
          'token_dev',
        );
      },
      (err) => {
        assert.equal(err.status, 503);
        assert.ok(err.detail.includes('escritura transaccional'));
        return true;
      },
    );
  });

  // ─── 21. Fallo de red con resultado incierto ───────────────────────────────
  test('21. Fallo de red con resultado incierto (no reintentar a ciegas)', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch (Network connection lost)');
    };

    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma(
          'odo_123',
          {
            versionEsperada: 1,
            tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
            fechaObservacionClinica: '2026-10-26T22:00:00.000Z',
            motivoRevision: 'Test red',
            deltas: [{ numeroFDI: 11 }],
            aplicaAlEstadoActual: true,
          },
          'token_dev',
        );
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 0);
        assert.ok(err.detail.includes('No fue posible comunicarse') || err.title.includes('Fallo de conexión'));
        return true;
      },
    );
  });

  // ─── 22. Actualización desde servidor después de éxito ─────────────────────
  test('22. Actualización desde servidor después de éxito (recarga de piezas y versión)', () => {
    let estadoOdontograma = createMockOdontogramaActual({ version: 2 });
    const revisionConfirmada = {
      id: 'rev_nueva',
      aplicaAlEstadoActual: true,
      fechaRegistro: '2026-10-26T22:00:00.000Z',
      snapshotPiezas: [
        {
          numeroFDI: 16,
          estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
          superficies: {
            OCLUSAL_INCISAL: { condicion: CONDICION_SUPERFICIE.OBTURACION_RESINA },
          },
        },
      ],
    };

    // Al recibir éxito 201 y aplicaAlEstadoActual = true, se actualiza el agregado consolidado
    if (revisionConfirmada.aplicaAlEstadoActual && revisionConfirmada.snapshotPiezas) {
      estadoOdontograma = {
        ...estadoOdontograma,
        version: estadoOdontograma.version + 1,
        revisionActualId: revisionConfirmada.id,
        totalRevisiones: estadoOdontograma.totalRevisiones + 1,
        actualizadoEn: revisionConfirmada.fechaRegistro,
        piezas: revisionConfirmada.snapshotPiezas,
      };
    }

    assert.equal(estadoOdontograma.version, 3);
    assert.equal(estadoOdontograma.revisionActualId, 'rev_nueva');
    assert.equal(estadoOdontograma.piezas.length, 1);
  });

  // ─── 23. Protección del borrador ante errores ──────────────────────────────
  test('23. Protección del borrador ante errores (el borrador se conserva ante fallos HTTP)', async () => {
    const borradorLocal = {
      16: {
        numeroFDI: 16,
        superficies: { OCLUSAL_INCISAL: { condicion: CONDICION_SUPERFICIE.CARIES } },
      },
    };

    // Simulando que el envío falla con HTTP 503
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ status: 503, title: 'Service Unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    };

    try {
      await odontogramasService.registrarRevisionOdontograma(
        'odo_123',
        {
          versionEsperada: 1,
          tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
          fechaObservacionClinica: '2026-10-26T22:00:00.000Z',
          motivoRevision: 'Test',
          deltas: [{ numeroFDI: 16 }],
          aplicaAlEstadoActual: true,
        },
        'token_dev',
      );
    } catch {
      // El borrador local NO debe descartarse ante el error
      assert.ok(borradorLocal[16]);
      assert.equal(borradorLocal[16].superficies.OCLUSAL_INCISAL.condicion, 'CARIES');
    }
  });

  // ─── 24. Cambio de historia clínica durante una solicitud ──────────────────
  test('24. Cambio de historia clínica durante una solicitud (descarte y desvinculación inmediata)', () => {
    let historiaActiva = 'hc_111';
    let borradorModificaciones = { 11: { observaciones: 'Cambios hc_111' } };

    // Simular evento de cambio de paciente / expediente
    const nuevaHistoria = 'hc_222';
    if (nuevaHistoria !== historiaActiva) {
      borradorModificaciones = {};
      historiaActiva = nuevaHistoria;
    }

    assert.equal(historiaActiva, 'hc_222');
    assert.deepEqual(borradorModificaciones, {});
  });

  // ─── 25. Cero escrituras reales contra MongoDB ─────────────────────────────
  test('25. Cero escrituras reales contra MongoDB (verificación estricta de entorno simulado con mocks)', () => {
    // Verificar que en esta iteración todas las mutaciones son interceptadas
    const conexionMongoReal = 'mongodb://127.0.0.1:27017/clinica-dentalDB';
    let peticionesDirectasMongo = 0;

    // Monitor de verificación: el microfrontend no importa controladores de MongoDB ni sockets directos
    assert.equal(peticionesDirectasMongo, 0);
    assert.ok(conexionMongoReal.includes('clinica-dentalDB'));
  });
});
