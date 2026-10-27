import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { estudiosService } from '../src/api/estudios.service.js';
import { ProblemDetailsError } from '../src/api/problem-details.js';

const TEST_TOKEN = 'token_dev_henry';

describe('MS2 — Sistema de Información Clínica: Estudios e Imagenología (Pruebas Unitarias)', () => {
  const originalFetch = globalThis.fetch;
  let lastFetchCall = null;

  beforeEach(() => {
    lastFetchCall = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ─── 1. Catálogo de Laboratorios ─────────────────────────────────────────
  test('1. listarLaboratorios con soloActivos=true envía query param correcto', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(JSON.stringify([{ id: 'lab_1', nombre: 'Lab Central', estado: 'ACTIVO' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await estudiosService.listarLaboratorios({ soloActivos: true }, TEST_TOKEN);
    assert.ok(lastFetchCall, 'fetch debe haber sido llamado');
    assert.ok(lastFetchCall.url.includes('/api/expediente/laboratorios?soloActivos=true'));
    assert.equal(lastFetchCall.options.method, 'GET');
    assert.equal(lastFetchCall.options.headers.Authorization, `Bearer ${TEST_TOKEN}`);
    assert.equal(res.length, 1);
    assert.equal(res[0].nombre, 'Lab Central');
  });

  test('2. crearLaboratorio envía payload POST a /laboratorios', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(
        JSON.stringify({ id: 'lab_new', nombre: 'Lab Dental 3D', estado: 'ACTIVO' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const payload = {
      nombre: 'Lab Dental 3D',
      contacto: '555-0123',
      descripcion: 'Modelos digitales y tomografías',
    };
    const res = await estudiosService.crearLaboratorio(payload, TEST_TOKEN);
    assert.ok(lastFetchCall.url.endsWith('/api/expediente/laboratorios'));
    assert.equal(lastFetchCall.options.method, 'POST');
    assert.deepEqual(JSON.parse(lastFetchCall.options.body), payload);
    assert.equal(res.id, 'lab_new');
  });

  test('3. cambiarEstadoLaboratorio envía PATCH a /laboratorios/:id/estado', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(JSON.stringify({ id: 'lab_1', estado: 'INACTIVO' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await estudiosService.cambiarEstadoLaboratorio('lab_1', 'INACTIVO', TEST_TOKEN);
    assert.ok(lastFetchCall.url.includes('/api/expediente/laboratorios/lab_1/estado'));
    assert.equal(lastFetchCall.options.method, 'PATCH');
    assert.deepEqual(JSON.parse(lastFetchCall.options.body), { estado: 'INACTIVO' });
    assert.equal(res.estado, 'INACTIVO');
  });

  // ─── 2. Catálogo de Tipos de Estudio ─────────────────────────────────────
  test('4. listarTiposEstudio filtra por categoría IMAGENOLOGIA y soloActivos', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await estudiosService.listarTiposEstudio({ categoria: 'IMAGENOLOGIA', soloActivos: true }, TEST_TOKEN);
    assert.ok(lastFetchCall.url.includes('/api/expediente/tipos-estudios?categoria=IMAGENOLOGIA&soloActivos=true'));
    assert.equal(lastFetchCall.options.method, 'GET');
  });

  test('5. crearTipoEstudio envía POST con código, nombre y categoría', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(
        JSON.stringify({ id: 'test_1', codigo: 'RX-PANO', nombre: 'Panorámica', categoria: 'IMAGENOLOGIA' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const payload = {
      codigo: 'RX-PANO',
      nombre: 'Panorámica',
      categoria: 'IMAGENOLOGIA',
      descripcion: 'Ortopantomografía digital',
    };
    const res = await estudiosService.crearTipoEstudio(payload, TEST_TOKEN);
    assert.ok(lastFetchCall.url.endsWith('/api/expediente/tipos-estudios'));
    assert.equal(lastFetchCall.options.method, 'POST');
    assert.equal(res.codigo, 'RX-PANO');
  });

  // ─── 3. Solicitudes de Estudio ───────────────────────────────────────────
  test('6. crearSolicitud envía POST a /estudios/solicitudes', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(
        JSON.stringify({ id: 'sol_1', estado: 'SOLICITADO', motivo: 'Molar retenido' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const payload = {
      consultaId: 'cons_123',
      tipoEstudioId: 'test_1',
      motivo: 'Molar retenido',
      prioridad: 'URGENTE',
    };
    const res = await estudiosService.crearSolicitud(payload, TEST_TOKEN);
    assert.ok(lastFetchCall.url.endsWith('/api/expediente/estudios/solicitudes'));
    assert.equal(lastFetchCall.options.method, 'POST');
    assert.equal(res.id, 'sol_1');
    assert.equal(res.estado, 'SOLICITADO');
  });

  test('7. listarSolicitudesPorHistoria consulta endpoint por ID de historia', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(JSON.stringify([{ id: 'sol_1' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await estudiosService.listarSolicitudesPorHistoria('hc_abc_123', TEST_TOKEN);
    assert.ok(lastFetchCall.url.includes('/api/expediente/estudios/solicitudes/historia/hc_abc_123'));
    assert.equal(lastFetchCall.options.method, 'GET');
    assert.equal(res.length, 1);
  });

  test('8. cambiarEstadoSolicitud envía PATCH a /estudios/solicitudes/:id/estado', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(JSON.stringify({ id: 'sol_1', estado: 'EN_PROCESO' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const payload = { nuevoEstado: 'EN_PROCESO', observaciones: 'Muestra recibida' };
    const res = await estudiosService.cambiarEstadoSolicitud('sol_1', payload, TEST_TOKEN);
    assert.ok(lastFetchCall.url.includes('/api/expediente/estudios/solicitudes/sol_1/estado'));
    assert.equal(lastFetchCall.options.method, 'PATCH');
    assert.equal(res.estado, 'EN_PROCESO');
  });

  // ─── 4. Registro de Resultados Clínicos ───────────────────────────────────
  test('9. registrarResultado envía POST a /estudios/solicitudes/:id/resultado y pasa a COMPLETADO', async () => {
    globalThis.fetch = async (url, options) => {
      lastFetchCall = { url, options };
      return new Response(
        JSON.stringify({
          id: 'sol_1',
          estado: 'COMPLETADO',
          resultado: {
            resumen: 'Inclusión ósea vertical de pieza 48',
            laboratorioId: 'lab_1',
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const payload = {
      resumen: 'Inclusión ósea vertical de pieza 48',
      laboratorioId: 'lab_1',
      observaciones: 'Sin reabsorción radicular vecina',
    };
    const res = await estudiosService.registrarResultado('sol_1', payload, TEST_TOKEN);
    assert.ok(lastFetchCall.url.includes('/api/expediente/estudios/solicitudes/sol_1/resultado'));
    assert.equal(lastFetchCall.options.method, 'POST');
    assert.equal(res.estado, 'COMPLETADO');
    assert.equal(res.resultado.resumen, 'Inclusión ósea vertical de pieza 48');
  });

  test('10. Manejo de error ProblemDetails RFC 7807 ante duplicado o validación', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          type: 'https://api.odontoclinic.local/errors/duplicate-codigo-tipo-estudio',
          title: 'Código de Tipo de Estudio Duplicado',
          status: 409,
          detail: 'Ya existe un tipo de estudio registrado con el código RX-PANO.',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    };

    await assert.rejects(
      async () => {
        await estudiosService.crearTipoEstudio({ codigo: 'RX-PANO', nombre: 'Test', categoria: 'IMAGENOLOGIA' }, TEST_TOKEN);
      },
      (err) => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 409);
        assert.equal(err.title, 'Código de Tipo de Estudio Duplicado');
        assert.equal(err.detail, 'Ya existe un tipo de estudio registrado con el código RX-PANO.');
        return true;
      },
    );
  });
});
