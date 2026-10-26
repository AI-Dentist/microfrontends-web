import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { odontogramasService } from '../src/api/odontogramas.service.js';
import { ProblemDetailsError } from '../src/api/problem-details.js';
import {
  ESTADO_ANATOMICO,
  ESTADO_EVALUACION,
  TIPO_SUPERFICIE,
  CONDICION_SUPERFICIE,
  TIPO_TRATAMIENTO_ESTRUCTURAL,
  TIPO_REVISION_ODONTOGRAMA,
  PIEZAS_FDI_VALIDAS_SET,
  esNumeroFDIValido,
  esDenticionPermanente,
  esDenticionTemporal,
  obtenerCuadranteFDI,
  validarPreservacionBasalPieza,
  AGRUPACION_CUADRANTES_FDI,
} from '../src/constants/odontograma.constants.js';

const TEST_TOKEN = 'token_dev_henry';

describe('Iteración 7F-1 — Arquitectura e Integración API del Odontograma', () => {
  const originalFetch = globalThis.fetch;
  let lastFetchCall = null;

  beforeEach(() => {
    lastFetchCall = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ─── 1. Construcción correcta de las seis rutas y verbos ──────────────────
  test('1. Construcción correcta de las seis rutas y métodos REST', async () => {
    const recordedCalls = [];

    globalThis.fetch = async (url, options) => {
      recordedCalls.push({ url, method: options.method });
      return new Response(JSON.stringify({ ok: true, piezas: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    // 1) inicializarOdontograma (POST /odontogramas/inicializar)
    await odontogramasService.inicializarOdontograma('hc_test_001', TEST_TOKEN);
    assert.equal(recordedCalls[0].method, 'POST');
    assert.ok(recordedCalls[0].url.endsWith('/api/expediente/odontogramas/inicializar'));

    // 2) obtenerOdontogramaActual (GET /odontogramas/historia/:id)
    await odontogramasService.obtenerOdontogramaActual('hc_test_001', TEST_TOKEN);
    assert.equal(recordedCalls[1].method, 'GET');
    assert.ok(recordedCalls[1].url.endsWith('/api/expediente/odontogramas/historia/hc_test_001'));

    // 3) registrarRevisionOdontograma (POST /odontogramas/:id/revisiones)
    await odontogramasService.registrarRevisionOdontograma(
      'odo_test_001',
      {
        versionEsperada: 1,
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
        fechaObservacionClinica: '2026-10-26T14:00:00.000Z',
        motivoRevision: 'Diagnóstico basal',
        deltas: [],
      },
      TEST_TOKEN,
    );
    assert.equal(recordedCalls[2].method, 'POST');
    assert.ok(recordedCalls[2].url.endsWith('/api/expediente/odontogramas/odo_test_001/revisiones'));

    // 4) listarHistorialOdontograma (GET /odontogramas/:id/historial)
    await odontogramasService.listarHistorialOdontograma(
      'odo_test_001',
      { limite: 15, offset: 30 },
      TEST_TOKEN,
    );
    assert.equal(recordedCalls[3].method, 'GET');
    assert.ok(
      recordedCalls[3].url.endsWith(
        '/api/expediente/odontogramas/odo_test_001/historial?limite=15&offset=30',
      ),
    );

    // 5) obtenerSnapshotRevision (GET /odontogramas/:id/revisiones/:revisionId)
    await odontogramasService.obtenerSnapshotRevision(
      'odo_test_001',
      'rev_test_999',
      TEST_TOKEN,
    );
    assert.equal(recordedCalls[4].method, 'GET');
    assert.ok(
      recordedCalls[4].url.endsWith(
        '/api/expediente/odontogramas/odo_test_001/revisiones/rev_test_999',
      ),
    );

    // 6) obtenerSnapshotsPorConsulta (GET /odontogramas/consulta/:consultaId)
    await odontogramasService.obtenerSnapshotsPorConsulta('cons_test_456', TEST_TOKEN);
    assert.equal(recordedCalls[5].method, 'GET');
    assert.ok(recordedCalls[5].url.endsWith('/api/expediente/odontogramas/consulta/cons_test_456'));

    assert.equal(recordedCalls.length, 6);
  });

  // ─── 2. Inclusión del token Bearer ─────────────────────────────────────────
  test('2. Inclusión obligatoria del token Bearer mediante el cliente HTTP', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(JSON.stringify({ id: 'odo_001' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await odontogramasService.obtenerOdontogramaActual('hc_auth_01', TEST_TOKEN);
    assert.ok(lastFetchCall);
    assert.equal(lastFetchCall.options.headers.Authorization, `Bearer ${TEST_TOKEN}`);
    assert.equal(
      lastFetchCall.options.headers.Accept,
      'application/json, application/problem+json',
    );
  });

  // ─── 3. Respuestas exitosas 200 y 201 ──────────────────────────────────────
  test('3. Respuestas exitosas 200 OK y 201 Created retornan datos deserializados', async () => {
    const mockOdontograma = {
      id: 'odo_100',
      historiaClinicaId: 'hc_100',
      pacienteId: 'pac_100',
      revisionActualId: 'rev_100',
      totalRevisiones: 1,
      version: 1,
      creadoEn: '2026-10-26T10:00:00.000Z',
      actualizadoEn: '2026-10-26T10:00:00.000Z',
      actualizadoPor: 'odonto_henry',
      piezas: [],
    };

    globalThis.fetch = async () => {
      return new Response(JSON.stringify(mockOdontograma), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const resultado = await odontogramasService.inicializarOdontograma('hc_100', TEST_TOKEN);
    assert.equal(resultado.id, 'odo_100');
    assert.equal(resultado.version, 1);
    assert.equal(resultado.totalRevisiones, 1);
  });

  // ─── 4. Errores 401 Unauthorized ──────────────────────────────────────────
  test('4. Error 401 Unauthorized lanza ProblemDetailsError', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/unauthorized',
          title: 'Autenticación requerida',
          status: 401,
          detail: 'Token JWT ausente o inválido.',
          instance: '/api/expediente/odontogramas/inicializar',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.inicializarOdontograma('hc_no_auth', 'token_invalido');
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 401);
        assert.equal(err.title, 'Autenticación requerida');
        assert.equal(err.detail, 'Token JWT ausente o inválido.');
        return true;
      },
    );
  });

  // ─── 5. Errores 404 Not Found ─────────────────────────────────────────────
  test('5. Error 404 Not Found lanza ProblemDetailsError estructurado', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/not-found',
          title: 'Recurso no encontrado',
          status: 404,
          detail: 'No existe odontograma asociado a la historia clínica indicada.',
          instance: '/api/expediente/odontogramas/historia/hc_inexistente',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.obtenerOdontogramaActual('hc_inexistente', TEST_TOKEN);
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 404);
        assert.equal(err.title, 'Recurso no encontrado');
        return true;
      },
    );
  });

  // ─── 6. Errores 409 Conflict sin sobrescritura automática ─────────────────
  test('6. Error 409 Conflict preserva la versión esperada y no sobrescribe automáticamente', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/conflict',
          title: 'Conflicto de concurrencia optimista',
          status: 409,
          detail: 'La versión esperada (1) no coincide con la versión actual del odontograma (2).',
          instance: '/api/expediente/odontogramas/odo_conflict/revisiones',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    const payload = {
      versionEsperada: 1,
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
      fechaObservacionClinica: '2026-10-26T14:10:00.000Z',
      motivoRevision: 'Revisión con versión desfasada',
      deltas: [],
    };

    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma('odo_conflict', payload, TEST_TOKEN);
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 409);
        assert.equal(err.title, 'Conflicto de concurrencia optimista');
        // Asegurar que el payload original local no fue mutado arbitrariamente
        assert.equal(payload.versionEsperada, 1);
        return true;
      },
    );
  });

  // ─── 7. Errores 422 Unprocessable Entity ───────────────────────────────────
  test('7. Error 422 Unprocessable Entity ante incompatibilidad clínica o anatómica', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/business-rule-violation',
          title: 'Entidad no procesable',
          status: 422,
          detail: 'No es posible aplicar caries a una pieza con estado EXTRAIDO.',
          instance: '/api/expediente/odontogramas/odo_422/revisiones',
          invalidParams: [
            {
              campo: 'deltas[0]',
              mensaje: 'Incompatibilidad anatómica entre estado EXTRAIDO y condición CARIES.',
            },
          ],
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma(
          'odo_422',
          {
            versionEsperada: 1,
            tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
            fechaObservacionClinica: '2026-10-26T14:15:00.000Z',
            motivoRevision: 'Intento de registro inválido',
            deltas: [{ numeroFDI: 16 }],
          },
          TEST_TOKEN,
        );
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 422);
        assert.equal(err.invalidParams.length, 1);
        assert.equal(err.invalidParams[0].campo, 'deltas[0]');
        return true;
      },
    );
  });

  // ─── 8. Errores 503 Service Unavailable ───────────────────────────────────
  test('8. Error 503 Service Unavailable informa indisponibilidad del servicio', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/service-unavailable',
          title: 'Servicio no disponible',
          status: 503,
          detail: 'Base de datos clínica temporalmente en modo de mantenimiento.',
          instance: '/api/expediente/odontogramas/odo_503/revisiones',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma(
          'odo_503',
          {
            versionEsperada: 2,
            tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
            fechaObservacionClinica: '2026-10-26T14:18:00.000Z',
            motivoRevision: 'Registro bajo corte de BD',
            deltas: [],
          },
          TEST_TOKEN,
        );
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 503);
        assert.equal(err.title, 'Servicio no disponible');
        return true;
      },
    );
  });

  // ─── 9. Conservación de estados DESCONOCIDO y NO_EVALUADO ─────────────────
  test('9. Conservación de estados basales DESCONOCIDO y NO_EVALUADO sin alteración a PRESENTE o SANO', () => {
    // Definición de una pieza basal recién inicializada
    const piezaBasal = {
      numeroFDI: 18,
      estadoAnatomico: ESTADO_ANATOMICO.DESCONOCIDO,
      estadoEvaluacion: ESTADO_EVALUACION.NO_EVALUADO,
      superficies: {
        VESTIBULAR: {
          superficie: TIPO_SUPERFICIE.VESTIBULAR,
          condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
          evaluada: false,
        },
        PALATINA_LINGUAL: {
          superficie: TIPO_SUPERFICIE.PALATINA_LINGUAL,
          condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
          evaluada: false,
        },
      },
      tratamientosEstructurales: [],
      observaciones: null,
    };

    const validacion = validarPreservacionBasalPieza(piezaBasal);
    assert.equal(validacion.esValida, true);

    // Regla clínica fundamental: DESCONOCIDO != PRESENTE y DESCONOCIDO != SANO
    assert.notEqual(piezaBasal.estadoAnatomico, ESTADO_ANATOMICO.PRESENTE);
    assert.notEqual(piezaBasal.estadoEvaluacion, ESTADO_EVALUACION.EVALUADO);
    assert.notEqual(piezaBasal.superficies.VESTIBULAR.condicion, CONDICION_SUPERFICIE.SANA);
    assert.equal(piezaBasal.superficies.VESTIBULAR.evaluada, false);

    // Tipos de tratamientos estructurales válidos
    assert.equal(TIPO_TRATAMIENTO_ESTRUCTURAL.CORONA, 'CORONA');
    assert.equal(TIPO_TRATAMIENTO_ESTRUCTURAL.ENDODONCIA, 'ENDODONCIA');
    assert.equal(TIPO_TRATAMIENTO_ESTRUCTURAL.PERNO_MUÑON, 'PERNO_MUÑON');
    assert.equal(TIPO_TRATAMIENTO_ESTRUCTURAL.IMPLANTE, 'IMPLANTE');
  });

  // ─── 10. Conservación de versionEsperada ───────────────────────────────────
  test('10. Conservación inmutable de versionEsperada y rechazo de valores inválidos', async () => {
    await assert.rejects(
      async () => {
        await odontogramasService.registrarRevisionOdontograma(
          'odo_v0',
          {
            versionEsperada: 0, // Invalido: debe ser entero >= 1
            tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
            fechaObservacionClinica: '2026-10-26T14:00:00.000Z',
            motivoRevision: 'Version 0 inválida',
            deltas: [],
          },
          TEST_TOKEN,
        );
      },
      (err) => {
        assert.match(err.message, /versionEsperada debe ser un número entero mayor o igual a 1/);
        return true;
      },
    );
  });

  // ─── 11. Validación de exactamente 52 posiciones FDI ───────────────────────
  test('11. Validación de 52 posiciones FDI y rechazo de números no anatómicos', () => {
    assert.equal(PIEZAS_FDI_VALIDAS_SET.size, 52);

    // Piezas anatómicas válidas
    assert.equal(esNumeroFDIValido(11), true);
    assert.equal(esNumeroFDIValido(18), true);
    assert.equal(esNumeroFDIValido(48), true);
    assert.equal(esNumeroFDIValido(55), true);
    assert.equal(esNumeroFDIValido(85), true);

    // Piezas anatómicamente inexistentes
    assert.equal(esNumeroFDIValido(19), false);
    assert.equal(esNumeroFDIValido(20), false);
    assert.equal(esNumeroFDIValido(29), false);
    assert.equal(esNumeroFDIValido(56), false);
    assert.equal(esNumeroFDIValido(99), false);
    assert.equal(esNumeroFDIValido('abc'), false);
    assert.equal(esNumeroFDIValido(null), false);
  });

  // ─── 12. Diferenciación permanente vs temporal ────────────────────────────
  test('12. Diferenciación entre dentición permanente (32) y decidua / temporal (20)', () => {
    let cuentaPermanentes = 0;
    let cuentaTemporales = 0;

    for (const fdi of PIEZAS_FDI_VALIDAS_SET) {
      if (esDenticionPermanente(fdi)) {
        cuentaPermanentes++;
        const cuadrante = obtenerCuadranteFDI(fdi);
        assert.ok(cuadrante >= 1 && cuadrante <= 4);
      } else if (esDenticionTemporal(fdi)) {
        cuentaTemporales++;
        const cuadrante = obtenerCuadranteFDI(fdi);
        assert.ok(cuadrante >= 5 && cuadrante <= 8);
      }
    }

    assert.equal(cuentaPermanentes, 32);
    assert.equal(cuentaTemporales, 20);
    assert.equal(cuentaPermanentes + cuentaTemporales, 52);

    // Agrupación clínica de cuadrantes
    assert.equal(AGRUPACION_CUADRANTES_FDI.cuadrante1.piezas.length, 8);
    assert.equal(AGRUPACION_CUADRANTES_FDI.cuadrante5.piezas.length, 5);
  });

  // ─── 13. Seguridad: No envío de odontologoId ni pacienteId ────────────────
  test('13. Regla de seguridad: Sanitización de payloads sin odontologoId ni pacienteId', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    // 1) En inicializar: no debe admitir ni enviar pacienteId ni odontologoId
    await odontogramasService.inicializarOdontograma('hc_seguridad_01', TEST_TOKEN);
    const bodyInicializar = JSON.parse(lastFetchCall.options.body);
    assert.equal(bodyInicializar.historiaClinicaId, 'hc_seguridad_01');
    assert.equal(bodyInicializar.pacienteId, undefined);
    assert.equal(bodyInicializar.odontologoId, undefined);

    // 2) En registrarRevision: si un payload externo intenta inyectar odontologoId o pacienteId, se eliminan
    const payloadConInyeccion = {
      versionEsperada: 1,
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
      fechaObservacionClinica: '2026-10-26T14:20:00.000Z',
      motivoRevision: 'Revisión clínica segura',
      deltas: [],
      odontologoId: 'intento_inyeccion_odonto',
      pacienteId: 'intento_inyeccion_paciente',
    };

    await odontogramasService.registrarRevisionOdontograma(
      'odo_seguro_01',
      payloadConInyeccion,
      TEST_TOKEN,
    );
    const bodyRevision = JSON.parse(lastFetchCall.options.body);
    assert.equal(bodyRevision.odontologoId, undefined);
    assert.equal(bodyRevision.pacienteId, undefined);
    assert.equal(bodyRevision.versionEsperada, 1);
    assert.equal(bodyRevision.motivoRevision, 'Revisión clínica segura');
  });

  // ─── 14. Historial con múltiples revisiones por consulta ──────────────────
  test('14. Historial por consulta soporta múltiples revisiones cronológicas', async () => {
    const mockRevisionesConsulta = [
      {
        id: 'rev_01',
        odontogramaId: 'odo_01',
        consultaId: 'cons_123',
        numeroRevision: 1,
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
        fechaRegistro: '2026-10-26T09:00:00.000Z',
        snapshotPiezas: [{ numeroFDI: 16, estadoAnatomico: ESTADO_ANATOMICO.PRESENTE }],
      },
      {
        id: 'rev_02',
        odontogramaId: 'odo_01',
        consultaId: 'cons_123',
        numeroRevision: 2,
        tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
        fechaRegistro: '2026-10-26T09:30:00.000Z',
        snapshotPiezas: [{ numeroFDI: 16, estadoAnatomico: ESTADO_ANATOMICO.PRESENTE }],
      },
    ];

    globalThis.fetch = async () => {
      return new Response(JSON.stringify(mockRevisionesConsulta), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const revisiones = await odontogramasService.obtenerSnapshotsPorConsulta(
      'cons_123',
      TEST_TOKEN,
    );
    assert.equal(revisiones.length, 2);
    assert.equal(revisiones[0].consultaId, 'cons_123');
    assert.equal(revisiones[1].consultaId, 'cons_123');
    assert.equal(revisiones[0].tipoRevision, TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION);
    assert.equal(revisiones[1].tipoRevision, TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA);
  });

  // ─── 15. Problem Details RFC 7807 ─────────────────────────────────────────
  test('15. Validación y parseo estricto del estándar Problem Details RFC 7807', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/validation-failed',
          title: 'Error de validación',
          status: 400,
          detail: 'El formato de los parámetros de paginación es incorrecto.',
          instance: '/api/expediente/odontogramas/odo_err/historial?limite=-5',
          invalidParams: [
            {
              campo: 'limite',
              mensaje: 'El límite debe ser al menos 1.',
            },
          ],
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    await assert.rejects(
      async () => {
        await odontogramasService.listarHistorialOdontograma(
          'odo_err',
          { limite: -5 },
          TEST_TOKEN,
        );
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.type, 'https://api.odontoclinic.local/errors/validation-failed');
        assert.equal(err.title, 'Error de validación');
        assert.equal(err.status, 400);
        assert.equal(err.detail, 'El formato de los parámetros de paginación es incorrecto.');
        assert.equal(
          err.instance,
          '/api/expediente/odontogramas/odo_err/historial?limite=-5',
        );
        assert.equal(err.invalidParams.length, 1);
        assert.equal(err.invalidParams[0].campo, 'limite');
        return true;
      },
    );
  });
});
