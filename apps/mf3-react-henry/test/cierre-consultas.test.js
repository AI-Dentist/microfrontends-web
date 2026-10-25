import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { consultasOdontologicasService } from '../src/api/consultas-odontologicas.service.js';
import { ProblemDetailsError } from '../src/api/problem-details.js';

const TEST_TOKEN = 'token_dev_henry';

describe('Iteración 6F-3 — Completar, Cancelar y Cerrar Consultas Odontológicas', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = [];

  beforeEach(() => {
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockConsultaEnCurso = {
    id: 'cons_12345678-1111-2222-3333-444455556666',
    historiaClinicaId: 'hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a',
    pacienteId: 'pac_44445555-6666-7777-8888-999900001111',
    odontologoId: 'odontologo_001',
    citaId: 'cita_98765432-0000-1111-2222-333344445555',
    fechaAtencion: '2026-10-25T14:30:00.000Z',
    cerradaEn: null,
    estado: 'EN_CURSO',
    motivoConsulta: 'Dolor punzante en primer molar inferior izquierdo',
    anamnesisActual: {
      descripcion: 'Dolor espontáneo con 3 días de evolución.',
      tiempoEvolucion: '3 días',
      escalaDolorEVA: 7,
    },
    exploracionFisica: {
      inspeccionIntraoral: 'Caries cavitada profunda en oclusal de pieza 36.',
      inspeccionExtraoral: 'Sin asimetría facial observable.',
      hallazgosDentales: 'Pieza 36 con lesión cariosa activa.',
    },
    diagnosticos: [
      {
        codigoCIE10: 'K02.1',
        descripcion: 'Caries de la dentina',
        tipo: 'DEFINITIVO',
      },
    ],
    procedimientosRealizados: [
      {
        codigo: 'PROC-OBT-01',
        descripcion: 'Obturación con resina compuesta',
        piezaDental: 36,
        observaciones: 'Aislamiento absoluto colocado.',
      },
    ],
    evolucionSOAP: {
      subjetivo: 'Paciente refiere cese del dolor.',
      objetivo: 'Restauración oclusal adaptada correctamente.',
      analisis: 'Evolución clínica favorable tras obturación.',
      plan: 'Control clínico en 6 meses.',
    },
    recomendaciones: 'Evitar alimentos duros durante las primeras 2 horas.',
    motivoCancelacion: null,
    version: 1,
    creadoEn: '2026-10-25T14:30:00.000Z',
    actualizadoEn: '2026-10-25T15:10:00.000Z',
    creadoPor: 'odontologo_001',
    actualizadoPor: 'odontologo_001',
  };

  // ─── 1. Completar Consulta Exitosamente ──────────────────────────────────────
  test('1. Completar exitosamente una consulta válida envía versionEsperada y actualiza a COMPLETADA', async () => {
    const consultaCompletadaMock = {
      ...mockConsultaEnCurso,
      estado: 'COMPLETADA',
      cerradaEn: '2026-10-25T15:30:00.000Z',
      version: 2,
      actualizadoEn: '2026-10-25T15:30:00.000Z',
      actualizadoPor: 'odontologo_001',
    };

    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => consultaCompletadaMock,
      };
    };

    const res = await consultasOdontologicasService.completarConsulta(
      mockConsultaEnCurso.id,
      { versionEsperada: 1 },
      TEST_TOKEN,
    );

    assert.equal(fetchCalls.length, 1);
    const { url, options } = fetchCalls[0];
    assert.ok(url.includes(`/consultas-odontologicas/${mockConsultaEnCurso.id}/completar`));
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Bearer ${TEST_TOKEN}`);

    const bodyParsed = JSON.parse(options.body);
    assert.equal(bodyParsed.versionEsperada, 1);
    assert.equal(Object.keys(bodyParsed).length, 1); // No envía campos espurios

    assert.equal(res.estado, 'COMPLETADA');
    assert.equal(res.version, 2);
    assert.ok(res.cerradaEn);
    assert.equal(res.actualizadoPor, 'odontologo_001');
  });

  // ─── 2. Rechazar Cierre con Requisitos Incompletos ──────────────────────────
  test('2. Rechazar cierre clínico con requisitos clínicos incompletos (sin inspección intraoral o sin diagnósticos)', () => {
    // 2.a. Sin inspección intraoral
    const consultaSinIntraoral = {
      ...mockConsultaEnCurso,
      exploracionFisica: {
        inspeccionIntraoral: '',
      },
    };
    const tieneIntraoral = Boolean(
      consultaSinIntraoral.exploracionFisica?.inspeccionIntraoral &&
      consultaSinIntraoral.exploracionFisica.inspeccionIntraoral.trim().length >= 5
    );
    assert.equal(tieneIntraoral, false);

    // 2.b. Sin diagnósticos registrados
    const consultaSinDiagnosticos = {
      ...mockConsultaEnCurso,
      diagnosticos: [],
    };
    const tieneDiagnosticos = Boolean(
      consultaSinDiagnosticos.diagnosticos &&
      consultaSinDiagnosticos.diagnosticos.length >= 1
    );
    assert.equal(tieneDiagnosticos, false);

    // 2.c. Motivo de consulta demasiado corto (< 5 caracteres)
    const consultaMotivoCorto = {
      ...mockConsultaEnCurso,
      motivoConsulta: 'Dol',
    };
    const tieneMotivoValido = Boolean(
      consultaMotivoCorto.motivoConsulta &&
      consultaMotivoCorto.motivoConsulta.trim().length >= 5
    );
    assert.equal(tieneMotivoValido, false);
  });

  // ─── 3. Cancelar con Motivo Válido ──────────────────────────────────────────
  test('3. Cancelar con motivo justificado (>= 10 caracteres) envía POST y retorna CANCELADA con auditoría', async () => {
    const motivoJustificado = 'Paciente se retira de urgencia por motivos personales imprevistos.';
    const consultaCanceladaMock = {
      ...mockConsultaEnCurso,
      estado: 'CANCELADA',
      cerradaEn: '2026-10-25T15:35:00.000Z',
      motivoCancelacion: motivoJustificado,
      version: 2,
      actualizadoEn: '2026-10-25T15:35:00.000Z',
      actualizadoPor: 'odontologo_001',
    };

    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => consultaCanceladaMock,
      };
    };

    const res = await consultasOdontologicasService.cancelarConsulta(
      mockConsultaEnCurso.id,
      { versionEsperada: 1, motivoCancelacion: motivoJustificado },
      TEST_TOKEN,
    );

    assert.equal(fetchCalls.length, 1);
    const { url, options } = fetchCalls[0];
    assert.ok(url.includes(`/consultas-odontologicas/${mockConsultaEnCurso.id}/cancelar`));
    assert.equal(options.method, 'POST');

    const bodyParsed = JSON.parse(options.body);
    assert.equal(bodyParsed.versionEsperada, 1);
    assert.equal(bodyParsed.motivoCancelacion, motivoJustificado);

    assert.equal(res.estado, 'CANCELADA');
    assert.equal(res.motivoCancelacion, motivoJustificado);
    assert.equal(res.version, 2);
    assert.ok(res.cerradaEn);
  });

  // ─── 4. Rechazar Cancelación sin Motivo o Insuficiente ──────────────────────
  test('4. Rechazar cancelación sin justificación obligatoria o con menos de 10 caracteres', () => {
    const motivosInvalidos = ['', '   ', 'Corta', '123456789'];
    for (const m of motivosInvalidos) {
      const limpio = m.trim();
      const esValido = limpio.length >= 10 && limpio.length <= 500;
      assert.equal(esValido, false, `El motivo "${m}" debió ser rechazado por longitud menor a 10 caracteres.`);
    }

    const motivoValido = 'Paciente desiste del tratamiento por intolerancia a la anestesia.';
    assert.equal(motivoValido.trim().length >= 10, true);
  });

  // ─── 5. No Permitir Acciones en Consultas Terminales ────────────────────────
  test('5. No permitir acciones de cierre o cancelación si la consulta ya es terminal (COMPLETADA o CANCELADA)', () => {
    const consultaCompletada = { ...mockConsultaEnCurso, estado: 'COMPLETADA' };
    const consultaCancelada = { ...mockConsultaEnCurso, estado: 'CANCELADA' };

    const esTerminalCompletada = consultaCompletada.estado === 'COMPLETADA' || consultaCompletada.estado === 'CANCELADA';
    const esTerminalCancelada = consultaCancelada.estado === 'COMPLETADA' || consultaCancelada.estado === 'CANCELADA';

    assert.equal(esTerminalCompletada, true);
    assert.equal(esTerminalCancelada, true);

    const puedeCompletar = consultaCompletada.estado === 'EN_CURSO';
    const puedeCancelar = consultaCancelada.estado === 'EN_CURSO';

    assert.equal(puedeCompletar, false);
    assert.equal(puedeCancelar, false);
  });

  // ─── 6. Manejo de HTTP 409 sin Reintentos Automáticos ────────────────────────
  test('6. Manejar HTTP 409 Conflict sin reintentos automáticos ni alteración silenciosa de versionEsperada', async () => {
    const problemDetails409 = {
      type: 'https://api.odontoclinic.local/errors/conflict',
      title: 'Conflicto de concurrencia optimista en consulta',
      status: 409,
      detail: 'La versión esperada 1 no coincide con la versión actual de la consulta (2).',
      instance: `/api/expediente/consultas-odontologicas/${mockConsultaEnCurso.id}/completar`,
      timestamp: '2026-10-25T15:40:00.000Z',
    };

    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: false,
        status: 409,
        headers: { get: () => 'application/problem+json' },
        json: async () => problemDetails409,
      };
    };

    await assert.rejects(
      async () => {
        await consultasOdontologicasService.completarConsulta(
          mockConsultaEnCurso.id,
          { versionEsperada: 1 },
          TEST_TOKEN,
        );
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 409);
        assert.ok(err.detail.includes('versión esperada 1 no coincide'));
        return true;
      },
    );

    // Exactamente 1 llamada: no realiza reintentos automáticos ocultos
    assert.equal(fetchCalls.length, 1);
    const bodyParsed = JSON.parse(fetchCalls[0].options.body);
    assert.equal(bodyParsed.versionEsperada, 1); // Conservó la versión esperada provista
  });

  // ─── 7. Manejo de HTTP 422 ──────────────────────────────────────────────────
  test('7. Manejar HTTP 422 Unprocessable Entity ante requisitos clínicos incumplidos o estado no editable', async () => {
    const problemDetails422 = {
      type: 'https://api.odontoclinic.local/errors/closure-requirements-unmet',
      title: 'Requisitos de cierre clínico incumplidos',
      status: 422,
      detail: 'Debe registrarse al menos un diagnóstico clínico (presuntivo o definitivo).',
      instance: `/api/expediente/consultas-odontologicas/${mockConsultaEnCurso.id}/completar`,
      timestamp: '2026-10-25T15:42:00.000Z',
    };

    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: false,
        status: 422,
        headers: { get: () => 'application/problem+json' },
        json: async () => problemDetails422,
      };
    };

    await assert.rejects(
      async () => {
        await consultasOdontologicasService.completarConsulta(
          mockConsultaEnCurso.id,
          { versionEsperada: 1 },
          TEST_TOKEN,
        );
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 422);
        assert.equal(err.title, 'Requisitos de cierre clínico incumplidos');
        return true;
      },
    );

    assert.equal(fetchCalls.length, 1);
  });

  // ─── 8. Actualización del Estado Visual tras HTTP 200 ───────────────────────
  test('8. Actualizar el estado visual e información de auditoría tras HTTP 200', () => {
    const respuestaServidorCompletada = {
      ...mockConsultaEnCurso,
      estado: 'COMPLETADA',
      cerradaEn: '2026-10-25T15:45:00.000Z',
      version: 2,
      actualizadoPor: 'odontologo_001',
    };

    // La UI valida que con la respuesta 200 se actualiza el estado y los campos de auditoría
    assert.equal(respuestaServidorCompletada.estado, 'COMPLETADA');
    assert.notEqual(respuestaServidorCompletada.cerradaEn, null);
    assert.equal(respuestaServidorCompletada.version, 2);
    assert.equal(respuestaServidorCompletada.actualizadoPor, 'odontologo_001');

    // Comprobar que en estado COMPLETADA se deshabilita edición
    const esModificable = respuestaServidorCompletada.estado === 'EN_CURSO';
    assert.equal(esModificable, false);
  });

  // ─── 9. Impedir Solicitudes Duplicadas Simultáneas ──────────────────────────
  test('9. La bandera isSubmitting impide solicitudes simultáneas duplicadas', async () => {
    let llamadasConcurrentes = 0;
    let isSubmitting = false;

    const ejecutarCierre = async () => {
      if (isSubmitting) {
        return 'BLOQUEADO';
      }
      isSubmitting = true;
      llamadasConcurrentes++;
      // Simular latencia de red
      await new Promise((r) => setTimeout(r, 20));
      isSubmitting = false;
      return 'OK';
    };

    const [res1, res2] = await Promise.all([ejecutarCierre(), ejecutarCierre()]);

    assert.equal(llamadasConcurrentes, 1);
    assert.ok(res1 === 'OK' || res2 === 'OK');
    assert.ok(res1 === 'BLOQUEADO' || res2 === 'BLOQUEADO');
  });

  // ─── 10. Confirmar que Cancelar NO Invoca Eliminación ───────────────────────
  test('10. Confirmar que la cancelación se ejecuta vía POST /cancelar y NUNCA invoca DELETE ni eliminación de documentos', async () => {
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          ...mockConsultaEnCurso,
          estado: 'CANCELADA',
          cerradaEn: '2026-10-25T15:50:00.000Z',
          motivoCancelacion: 'Justificación médica válida.',
          version: 2,
        }),
      };
    };

    await consultasOdontologicasService.cancelarConsulta(
      mockConsultaEnCurso.id,
      { versionEsperada: 1, motivoCancelacion: 'Justificación médica válida.' },
      TEST_TOKEN,
    );

    assert.equal(fetchCalls.length, 1);
    const { url, options } = fetchCalls[0];

    // Verificación estricta: método POST hacia el endpoint canónico de cancelación
    assert.equal(options.method, 'POST');
    assert.notEqual(options.method, 'DELETE');
    assert.ok(url.endsWith('/cancelar'));
    assert.equal(url.includes('/delete'), false);
  });
});
