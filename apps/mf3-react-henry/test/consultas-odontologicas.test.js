import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { consultasOdontologicasService } from '../src/api/consultas-odontologicas.service.js';
import { ProblemDetailsError } from '../src/api/problem-details.js';

const TEST_TOKEN = 'token_dev_henry';

describe('Iteración 6F-1 — Servicio API Consultas Odontológicas (Pruebas Aisladas con Mocks)', () => {
  const originalFetch = globalThis.fetch;
  let lastFetchCall = null;

  beforeEach(() => {
    lastFetchCall = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ─── 1. Construcción de Rutas, Paginación y Headers ───────────────────────
  test('1. Listado por historia construye ruta con parámetros de paginación y cabecera Bearer', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(
        JSON.stringify({
          consultas: [],
          total: 0,
          limite: 15,
          offset: 30,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    const res = await consultasOdontologicasService.listarPorHistoria(
      'hc_test_12345',
      { limite: 15, offset: 30 },
      TEST_TOKEN,
    );

    assert.ok(lastFetchCall, 'fetch debe haber sido invocado');
    assert.ok(
      lastFetchCall.url.includes('/api/expediente/consultas-odontologicas/historia/hc_test_12345?limite=15&offset=30'),
      `Ruta generada incorrecta: ${lastFetchCall.url}`,
    );
    assert.equal(lastFetchCall.options.method, 'GET');
    assert.equal(lastFetchCall.options.headers.Authorization, `Bearer ${TEST_TOKEN}`);
    assert.equal(res.total, 0);
    assert.equal(res.limite, 15);
    assert.equal(res.offset, 30);
  });

  // ─── 2. Apertura con Cita Programada (201 Created) ────────────────────────
  test('2. Apertura de consulta con cita programada envía payload correcto y retorna 201', async () => {
    const payloadEsperado = {
      historiaClinicaId: 'hc_activa_001',
      pacienteId: 'pac_sintetico_001',
      motivoConsulta: 'Dolor punzante en sector 3',
      citaId: 'cita_ms3_999',
      fechaAtencion: '2026-10-22T10:00:00.000Z',
    };

    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(
        JSON.stringify({
          id: 'cons_12345678-aaaa-bbbb',
          historiaClinicaId: payloadEsperado.historiaClinicaId,
          pacienteId: payloadEsperado.pacienteId,
          odontologoId: 'od_henry_principal',
          citaId: payloadEsperado.citaId,
          versionHistoriaReferenciada: 1,
          snapshotRiesgoClinico: {
            alergiasCriticas: [{ sustancia: 'Penicilina', severidad: 'GRAVE' }],
            condicionesMedicas: ['Hipertensión arterial'],
            medicacionHabitual: ['Enalapril 10mg'],
            capturadoEn: '2026-10-22T10:00:00.000Z',
          },
          fechaAtencion: payloadEsperado.fechaAtencion,
          cerradaEn: null,
          estado: 'EN_CURSO',
          motivoConsulta: payloadEsperado.motivoConsulta,
          anamnesisActual: { descripcion: 'Dolor agudo', tiempoEvolucion: '24h', escalaDolorEVA: 7 },
          exploracionFisica: { inspeccionIntraoral: 'Caries cavitada' },
          diagnosticos: [],
          procedimientosRealizados: [],
          evolucionSOAP: { subjetivo: null, objetivo: null, analisis: null, plan: null },
          recomendaciones: null,
          motivoCancelacion: null,
          version: 1,
          creadoEn: '2026-10-22T10:00:00.000Z',
          actualizadoEn: '2026-10-22T10:00:00.000Z',
          creadoPor: 'od_henry_principal',
          actualizadoPor: 'od_henry_principal',
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    const res = await consultasOdontologicasService.abrirConsulta(payloadEsperado, TEST_TOKEN);

    assert.ok(lastFetchCall.url.endsWith('/api/expediente/consultas-odontologicas'));
    assert.equal(lastFetchCall.options.method, 'POST');
    assert.equal(lastFetchCall.options.headers['Content-Type'], 'application/json');
    assert.equal(lastFetchCall.options.headers.Authorization, `Bearer ${TEST_TOKEN}`);

    const bodyEnviado = JSON.parse(lastFetchCall.options.body);
    assert.equal(bodyEnviado.historiaClinicaId, 'hc_activa_001');
    assert.equal(bodyEnviado.citaId, 'cita_ms3_999');

    assert.equal(res.id, 'cons_12345678-aaaa-bbbb');
    assert.equal(res.estado, 'EN_CURSO');
    assert.equal(res.snapshotRiesgoClinico.alergiasCriticas.length, 1);
  });

  // ─── 3. Apertura Sin Cita (Urgencia) con citaId = null ───────────────────
  test('3. Apertura de consulta sin cita previa envía citaId como null', async () => {
    const payloadSinCita = {
      historiaClinicaId: 'hc_urgencia_002',
      pacienteId: 'pac_urgencia_002',
      motivoConsulta: 'Fractura coronaria traumática',
      citaId: null,
    };

    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(
        JSON.stringify({
          id: 'cons_urgencia_111',
          ...payloadSinCita,
          estado: 'EN_CURSO',
          version: 1,
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const res = await consultasOdontologicasService.abrirConsulta(payloadSinCita, TEST_TOKEN);

    assert.equal(res.id, 'cons_urgencia_111');
    const bodyEnviado = JSON.parse(lastFetchCall.options.body);
    assert.equal(bodyEnviado.citaId, null);
  });

  // ─── 4. Validación de Campos Obligatorios en el Cliente ───────────────────
  test('4. Apertura rechaza anticipadamente campos obligatorios faltantes', async () => {
    await assert.rejects(
      async () => consultasOdontologicasService.abrirConsulta({ pacienteId: 'pac-1', motivoConsulta: 'Motivo' }, TEST_TOKEN),
      /historia clínica es obligatorio/,
    );

    await assert.rejects(
      async () => consultasOdontologicasService.abrirConsulta({ historiaClinicaId: 'hc-1', motivoConsulta: 'Motivo' }, TEST_TOKEN),
      /paciente es obligatorio/,
    );

    await assert.rejects(
      async () => consultasOdontologicasService.abrirConsulta({ historiaClinicaId: 'hc-1', pacienteId: 'pac-1', motivoConsulta: '   ' }, TEST_TOKEN),
      /motivo de consulta es obligatorio/,
    );
  });

  // ─── 5. Detalle de Consulta por ID (GET /:id) ─────────────────────────────
  test('5. Consulta por ID recupera la ficha completa', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(
        JSON.stringify({
          id: 'cons_detalle_999',
          historiaClinicaId: 'hc_123',
          pacienteId: 'pac_123',
          odontologoId: 'od_henry',
          estado: 'EN_CURSO',
          motivoConsulta: 'Control periódico',
          diagnosticos: [{ codigoCIE10: 'K02.1', descripcion: 'Caries de la dentina', tipo: 'DEFINITIVO' }],
          procedimientosRealizados: [{ codigo: 'PROC-01', descripcion: 'Obturación con resina', piezaDental: 36 }],
          evolucionSOAP: { subjetivo: 'Asintomático', objetivo: 'Restauración pulida', analisis: 'Evolución favorable', plan: 'Alta clínica' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const res = await consultasOdontologicasService.getById('cons_detalle_999', TEST_TOKEN);

    assert.ok(lastFetchCall.url.endsWith('/api/expediente/consultas-odontologicas/cons_detalle_999'));
    assert.equal(res.id, 'cons_detalle_999');
    assert.equal(res.diagnosticos.length, 1);
    assert.equal(res.procedimientosRealizados[0].piezaDental, 36);
  });

  // ─── 6. Errores RFC 7807 Problem Details (404, 409, 422, 401) ─────────────
  test('6. Interpreta adecuadamente errores RFC 7807 (404 Consulta No Encontrada)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/not-found',
          title: 'Consulta odontológica no encontrada',
          status: 404,
          detail: 'No existe ninguna consulta odontológica registrada con ID cons_inexistente.',
          instance: '/api/expediente/consultas-odontologicas/cons_inexistente',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    try {
      await consultasOdontologicasService.getById('cons_inexistente', TEST_TOKEN);
      assert.fail('Debió lanzar excepción');
    } catch (err) {
      assert.ok(err instanceof ProblemDetailsError, 'Debe ser instancia de ProblemDetailsError');
      assert.equal(err.status, 404);
      assert.equal(err.title, 'Consulta odontológica no encontrada');
      assert.ok(err.detail.includes('cons_inexistente'));
    }
  });

  test('7. Interpreta adecuadamente error 409 Conflict (Cita ya asignada)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/conflict',
          title: 'Cita odontológica ya asignada',
          status: 409,
          detail: 'La cita cita_duplicada ya se encuentra asociada a otra consulta odontológica.',
          instance: '/api/expediente/consultas-odontologicas',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    try {
      await consultasOdontologicasService.abrirConsulta(
        { historiaClinicaId: 'hc-1', pacienteId: 'pac-1', motivoConsulta: 'Test', citaId: 'cita_duplicada' },
        TEST_TOKEN,
      );
      assert.fail('Debió lanzar excepción');
    } catch (err) {
      assert.equal(err.status, 409);
      assert.equal(err.title, 'Cita odontológica ya asignada');
    }
  });

  test('8. Interpreta adecuadamente error 422 Unprocessable Entity (Historia no habilitada)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/chart-not-eligible',
          title: 'Historia clínica no habilitada',
          status: 422,
          detail: 'No es posible abrir una consulta porque la historia clínica está CERRADA.',
          instance: '/api/expediente/consultas-odontologicas',
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    try {
      await consultasOdontologicasService.abrirConsulta(
        { historiaClinicaId: 'hc_cerrada', pacienteId: 'pac-1', motivoConsulta: 'Test' },
        TEST_TOKEN,
      );
      assert.fail('Debió lanzar excepción');
    } catch (err) {
      assert.equal(err.status, 422);
      assert.equal(err.title, 'Historia clínica no habilitada');
    }
  });

  test('9. Interpreta adecuadamente error 401 Unauthorized', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/unauthorized',
          title: 'Autenticación requerida',
          status: 401,
          detail: 'Token de autenticación inválido o ausente.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    try {
      await consultasOdontologicasService.listarPorHistoria('hc-1', {}, 'token_invalido');
      assert.fail('Debió lanzar excepción');
    } catch (err) {
      assert.equal(err.status, 401);
      assert.equal(err.title, 'Autenticación requerida');
    }
  });

  // ─── 10. Fallo de Conexión de Red ─────────────────────────────────────────
  test('10. Transforma fallo de red o fetch caído en ProblemDetailsError con status 0', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    try {
      await consultasOdontologicasService.listarPorHistoria('hc-1', {}, TEST_TOKEN);
      assert.fail('Debió lanzar excepción');
    } catch (err) {
      assert.ok(err instanceof ProblemDetailsError);
      assert.equal(err.status, 0);
      assert.equal(err.title, 'Fallo de conexión');
      assert.ok(err.detail.includes('No fue posible comunicarse'));
    }
  });

  // ─── 11. Métodos 6F-2 / 6F-3 Compatibilidad con API ───────────────────────
  test('11. Métodos de atención, completar y cancelar apuntan a las rutas y verbos REST correspondientes', async () => {
    // 1. actualizarAtencion (PUT)
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(JSON.stringify({ id: 'cons_1', version: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    await consultasOdontologicasService.actualizarAtencion('cons_1', { versionEsperada: 1 }, TEST_TOKEN);
    assert.ok(lastFetchCall.url.endsWith('/api/expediente/consultas-odontologicas/cons_1/atencion'));
    assert.equal(lastFetchCall.options.method, 'PUT');

    // 2. completarConsulta (POST)
    await consultasOdontologicasService.completarConsulta('cons_1', { versionEsperada: 2 }, TEST_TOKEN);
    assert.ok(lastFetchCall.url.endsWith('/api/expediente/consultas-odontologicas/cons_1/completar'));
    assert.equal(lastFetchCall.options.method, 'POST');

    // 3. cancelarConsulta (POST)
    await consultasOdontologicasService.cancelarConsulta('cons_1', { versionEsperada: 2, motivoCancelacion: 'Paciente ausente' }, TEST_TOKEN);
    assert.ok(lastFetchCall.url.endsWith('/api/expediente/consultas-odontologicas/cons_1/cancelar'));
    assert.equal(lastFetchCall.options.method, 'POST');
    const cancelBody = JSON.parse(lastFetchCall.options.body);
    assert.equal(cancelBody.motivoCancelacion, 'Paciente ausente');
  });
});
