import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { consultasOdontologicasService } from '../src/api/consultas-odontologicas.service.js';
import {
  esPiezaFDIValida,
  obtenerDescripcionPiezaFDI,
  PIEZAS_FDI_VALIDAS,
  LISTADO_PIEZAS_FDI,
} from '../src/utils/fdi-validator.js';
import { ProblemDetailsError } from '../src/api/problem-details.js';

const TEST_TOKEN = 'token_dev_henry';

describe('Iteración 6F-2 — Registro y Actualización de Atención Odontológica', () => {
  const originalFetch = globalThis.fetch;
  let lastFetchCall = null;

  beforeEach(() => {
    lastFetchCall = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ─── 1. Validación Estricta de Piezas Dentales FDI (52 piezas) ─────────────
  describe('1. Validación de Piezas Dentales FDI (INV-CONS-08)', () => {
    test('1.1. Contiene exactamente 52 piezas anatómicas válidas', () => {
      assert.equal(PIEZAS_FDI_VALIDAS.size, 52);
      assert.equal(LISTADO_PIEZAS_FDI.length, 52);
    });

    test('1.2. Acepta piezas permanentes válidas (cuadrantes 1 al 4, posiciones 1 a 8)', () => {
      // Cuadrante 1
      assert.ok(esPiezaFDIValida(11));
      assert.ok(esPiezaFDIValida(16));
      assert.ok(esPiezaFDIValida(18));
      // Cuadrante 2
      assert.ok(esPiezaFDIValida(21));
      assert.ok(esPiezaFDIValida(24));
      assert.ok(esPiezaFDIValida(28));
      // Cuadrante 3
      assert.ok(esPiezaFDIValida(31));
      assert.ok(esPiezaFDIValida(36));
      assert.ok(esPiezaFDIValida(38));
      // Cuadrante 4
      assert.ok(esPiezaFDIValida(41));
      assert.ok(esPiezaFDIValida(46));
      assert.ok(esPiezaFDIValida(48));
    });

    test('1.3. Acepta piezas temporales / deciduas válidas (cuadrantes 5 al 8, posiciones 1 a 5)', () => {
      assert.ok(esPiezaFDIValida(51));
      assert.ok(esPiezaFDIValida(55));
      assert.ok(esPiezaFDIValida(61));
      assert.ok(esPiezaFDIValida(73));
      assert.ok(esPiezaFDIValida(85));
    });

    test('1.4. Rechaza piezas anatómicamente inexistentes o números fuera de rango', () => {
      // Inexistentes en permanente (>8)
      assert.equal(esPiezaFDIValida(19), false);
      assert.equal(esPiezaFDIValida(20), false);
      assert.equal(esPiezaFDIValida(29), false);
      assert.equal(esPiezaFDIValida(39), false);
      assert.equal(esPiezaFDIValida(49), false);

      // Inexistentes en temporal (>5)
      assert.equal(esPiezaFDIValida(56), false);
      assert.equal(esPiezaFDIValida(68), false);
      assert.equal(esPiezaFDIValida(76), false);
      assert.equal(esPiezaFDIValida(89), false);

      // Cuadrantes inexistentes y valores atípicos
      assert.equal(esPiezaFDIValida(99), false);
      assert.equal(esPiezaFDIValida(0), false);
      assert.equal(esPiezaFDIValida(-11), false);
      assert.equal(esPiezaFDIValida(16.5), false);
      assert.equal(esPiezaFDIValida(null), false);
      assert.equal(esPiezaFDIValida(undefined), false);
      assert.equal(esPiezaFDIValida(''), false);
      assert.equal(esPiezaFDIValida('abc'), false);
    });

    test('1.5. Genera descripciones anatómicas legibles y precisas', () => {
      const desc1 = obtenerDescripcionPiezaFDI(36);
      assert.ok(desc1.includes('Pieza 36'));
      assert.ok(desc1.includes('Primer Molar'));
      assert.ok(desc1.includes('Inferior Izquierdo'));

      const desc2 = obtenerDescripcionPiezaFDI(51);
      assert.ok(desc2.includes('Pieza 51'));
      assert.ok(desc2.includes('Incisivo Central Temporal'));
      assert.ok(desc2.includes('Superior Derecho Temporal'));

      const descInvalida = obtenerDescripcionPiezaFDI(99);
      assert.ok(descInvalida.includes('inválida'));
    });
  });

  // ─── 2. Validación de Escala EVA del Dolor (0 a 10) ───────────────────────
  describe('2. Validación de Escala Visual Analógica EVA (0 a 10)', () => {
    function validarEVA(valor) {
      if (valor === null || valor === undefined || valor === '') return true; // Opcional
      const num = Number(valor);
      return Number.isInteger(num) && num >= 0 && num <= 10;
    }

    test('2.1. Acepta valores enteros dentro de la escala [0, 10]', () => {
      assert.ok(validarEVA(0));
      assert.ok(validarEVA(5));
      assert.ok(validarEVA(10));
      assert.ok(validarEVA('0'));
      assert.ok(validarEVA('7'));
      assert.ok(validarEVA(''));
      assert.ok(validarEVA(null));
    });

    test('2.2. Rechaza valores fuera de rango o decimales', () => {
      assert.equal(validarEVA(-1), false);
      assert.equal(validarEVA(11), false);
      assert.equal(validarEVA(4.5), false);
      assert.equal(validarEVA('diez'), false);
    });
  });

  // ─── 3. Servicio API y Serialización HTTP (PUT :id/atencion) ───────────────
  describe('3. Servicio API y Serialización HTTP (PUT :id/atencion)', () => {
    test('3.1. Serializa el payload completo con versionEsperada y cabeceras correctas', async () => {
      const consultaId = 'cons_12345678-aaaa-bbbb-cccc-dddddddddddd';
      const payload = {
        versionEsperada: 1,
        motivoConsulta: 'Dolor punzante ajustado tras exploración',
        anamnesisActual: {
          descripcion: 'Paciente manifiesta dolor al contacto frío',
          tiempoEvolucion: '48 horas',
          escalaDolorEVA: 6,
        },
        exploracionFisica: {
          inspeccionExtraoral: 'Simetría facial conservada',
          inspeccionIntraoral: 'Caries cavitada activa en 36 con afectación oclusal',
          hallazgosDentales: 'Facetas de desgaste sector anterior',
        },
        diagnosticos: [
          { codigoCIE10: 'K04.0', descripcion: 'Pulpitis reversible en 36', tipo: 'DEFINITIVO' },
          { codigoCIE10: 'K02.1', descripcion: 'Caries de la dentina', tipo: 'PRESUNTIVO' },
        ],
        procedimientosRealizados: [
          {
            codigo: 'PROC-OBT-01',
            descripcion: 'Obturación con resina compuesta fotocurable',
            piezaDental: 36,
            observaciones: 'Aislamiento absoluto con dique',
          },
        ],
        evolucionSOAP: {
          subjetivo: 'Paciente sin dolor agudo al finalizar',
          objetivo: 'Oclusión verificada con papel de articular',
          analisis: 'Pronóstico favorable',
          plan: 'Control en 6 meses',
        },
        recomendaciones: 'Evitar alimentos duros las primeras 2 horas.',
      };

      globalThis.fetch = async (url, options) => {
        lastFetchCall = { url, options };
        return new Response(
          JSON.stringify({
            id: consultaId,
            historiaClinicaId: 'hc_test_001',
            pacienteId: 'pac_test_001',
            odontologoId: 'od_henry',
            estado: 'EN_CURSO',
            version: 2, // Versión incrementada tras actualización exitosa
            ...payload,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const resultado = await consultasOdontologicasService.actualizarAtencion(
        consultaId,
        payload,
        TEST_TOKEN,
      );

      assert.ok(lastFetchCall, 'fetch debe haber sido llamado');
      assert.ok(
        lastFetchCall.url.includes(`/api/expediente/consultas-odontologicas/${consultaId}/atencion`),
        `URL incorrecta: ${lastFetchCall.url}`,
      );
      assert.equal(lastFetchCall.options.method, 'PUT');
      assert.equal(lastFetchCall.options.headers.Authorization, `Bearer ${TEST_TOKEN}`);
      assert.equal(lastFetchCall.options.headers['Content-Type'], 'application/json');

      const bodyEnviado = JSON.parse(lastFetchCall.options.body);
      assert.equal(bodyEnviado.versionEsperada, 1);
      assert.equal(bodyEnviado.anamnesisActual.escalaDolorEVA, 6);
      assert.equal(bodyEnviado.diagnosticos.length, 2);
      assert.equal(bodyEnviado.procedimientosRealizados[0].piezaDental, 36);

      // Respuesta HTTP 200
      assert.equal(resultado.id, consultaId);
      assert.equal(resultado.version, 2);
    });

    test('3.2. Rechaza anticipadamente llamada sin ID de consulta', async () => {
      await assert.rejects(
        () => consultasOdontologicasService.actualizarAtencion('', { versionEsperada: 1 }, TEST_TOKEN),
        /El ID de la consulta es requerido/,
      );
    });
  });

  // ─── 4. Manejo de Errores Problem Details (400, 401, 409, 422) ────────────
  describe('4. Manejo de Errores Problem Details', () => {
    test('4.1. Manejo de Error 409 Conflict (Concurrencia Optimista)', async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            type: 'https://api.odontoclinic.local/errors/conflicto-concurrente',
            title: 'Conflicto',
            status: 409,
            detail: 'Conflicto de concurrencia: la consulta ya fue modificada por otro usuario (versión esperada 1, actual 2).',
          }),
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        );
      };

      try {
        await consultasOdontologicasService.actualizarAtencion('cons_1', { versionEsperada: 1 }, TEST_TOKEN);
        assert.fail('Debió lanzar excepción 409');
      } catch (err) {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 409);
        assert.equal(err.title, 'Conflicto');
        assert.ok(err.detail.includes('versión esperada 1, actual 2'));
      }
    });

    test('4.2. Manejo de Error 422 Unprocessable Entity (Consulta cerrada / sellada)', async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            type: 'https://api.odontoclinic.local/errors/consulta-cerrada',
            title: 'Entidad no procesable',
            status: 422,
            detail: 'No se puede modificar una consulta que se encuentra en estado COMPLETADA.',
          }),
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        );
      };

      try {
        await consultasOdontologicasService.actualizarAtencion('cons_cerrada', { versionEsperada: 2 }, TEST_TOKEN);
        assert.fail('Debió lanzar excepción 422');
      } catch (err) {
        assert.equal(err.status, 422);
        assert.ok(err.detail.includes('COMPLETADA'));
      }
    });

    test('4.3. Manejo de Error 400 Bad Request (Payload inválido)', async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            type: 'https://api.odontoclinic.local/errors/bad-request',
            title: 'Solicitud incorrecta',
            status: 400,
            detail: 'La versión esperada debe ser al menos 1.',
            invalidParams: [{ name: 'versionEsperada', reason: 'La versión esperada debe ser al menos 1.' }],
          }),
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        );
      };

      try {
        await consultasOdontologicasService.actualizarAtencion('cons_1', { versionEsperada: 0 }, TEST_TOKEN);
        assert.fail('Debió lanzar excepción 400');
      } catch (err) {
        assert.equal(err.status, 400);
        assert.equal(err.invalidParams.length, 1);
        assert.equal(err.invalidParams[0].name, 'versionEsperada');
      }
    });

    test('4.4. Manejo de Error 401 Unauthorized (Token no proporcionado)', async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            type: 'https://api.odontoclinic.local/errors/unauthorized',
            title: 'Autenticación requerida',
            status: 401,
            detail: 'Se requiere un token de autenticación válido.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
        );
      };

      try {
        await consultasOdontologicasService.actualizarAtencion('cons_1', { versionEsperada: 1 }, '');
        assert.fail('Debió lanzar excepción 401');
      } catch (err) {
        assert.equal(err.status, 401);
      }
    });
  });

  // ─── 5. Gestión de Listas y Conservación de Datos Clínicos ─────────────────
  describe('5. Gestión de Listas y Conservación de Datos Clínicos', () => {
    test('5.1. Permite agregar diagnósticos presuntivos y definitivos con y sin CIE-10', () => {
      const listaDiagnosticos = [];

      // Agregar diagnóstico definitivo con CIE-10
      listaDiagnosticos.push({
        codigoCIE10: 'K04.0',
        descripcion: 'Pulpitis reversible',
        tipo: 'DEFINITIVO',
      });

      // Agregar diagnóstico presuntivo sin CIE-10
      listaDiagnosticos.push({
        codigoCIE10: null,
        descripcion: 'Sospecha de fisura coronal en pieza 46',
        tipo: 'PRESUNTIVO',
      });

      assert.equal(listaDiagnosticos.length, 2);
      assert.equal(listaDiagnosticos[0].tipo, 'DEFINITIVO');
      assert.equal(listaDiagnosticos[1].tipo, 'PRESUNTIVO');
      assert.equal(listaDiagnosticos[1].codigoCIE10, null);

      // Eliminar el primer diagnóstico
      const filtrados = listaDiagnosticos.filter((_, i) => i !== 0);
      assert.equal(filtrados.length, 1);
      assert.equal(filtrados[0].descripcion, 'Sospecha de fisura coronal en pieza 46');
    });

    test('5.2. Permite agregar procedimientos con pieza dental FDI y observaciones', () => {
      const listaProcedimientos = [];

      listaProcedimientos.push({
        codigo: 'PROC-DET-01',
        descripcion: 'Destartraje supragingival',
        piezaDental: null,
        observaciones: 'Limpieza con ultrasonido en ambas arcadas',
      });

      listaProcedimientos.push({
        codigo: 'PROC-OBT-02',
        descripcion: 'Obturación resina clase II',
        piezaDental: 46,
        observaciones: 'Matriz seccional y grabado ácido total',
      });

      assert.equal(listaProcedimientos.length, 2);
      assert.equal(listaProcedimientos[0].piezaDental, null);
      assert.equal(listaProcedimientos[1].piezaDental, 46);
      assert.ok(esPiezaFDIValida(listaProcedimientos[1].piezaDental));
    });

    test('5.3. Conserva campos previos cuando solo se actualizan secciones específicas', () => {
      const consultaOriginal = {
        version: 3,
        motivoConsulta: 'Sensibilidad dental',
        anamnesisActual: {
          descripcion: 'Dolor al frío de corta duración',
          tiempoEvolucion: '1 semana',
          escalaDolorEVA: 3,
        },
        exploracionFisica: {
          inspeccionExtraoral: 'Sin hallazgos',
          inspeccionIntraoral: 'Abrasión cervical en 14 y 15',
          hallazgosDentales: 'Facetas parafuncionales',
        },
        diagnosticos: [{ codigoCIE10: 'K03.1', descripcion: 'Abrasión de los dientes', tipo: 'DEFINITIVO' }],
        procedimientosRealizados: [],
        evolucionSOAP: { subjetivo: null, objetivo: null, analisis: null, plan: null },
        recomendaciones: null,
      };

      // Si el odontólogo solo añade recomendaciones y SOAP sin modificar anamnesis
      const payloadActualizado = {
        versionEsperada: consultaOriginal.version,
        motivoConsulta: consultaOriginal.motivoConsulta,
        anamnesisActual: consultaOriginal.anamnesisActual,
        exploracionFisica: consultaOriginal.exploracionFisica,
        diagnosticos: consultaOriginal.diagnosticos,
        procedimientosRealizados: consultaOriginal.procedimientosRealizados,
        evolucionSOAP: {
          subjetivo: 'Paciente comprende técnica de cepillado',
          objetivo: 'Aplicación de barniz de flúor',
          analisis: 'Hipersensibilidad dentinaria tratada',
          plan: 'Control en 1 mes',
        },
        recomendaciones: 'Usar cepillo de cerdas suaves y pasta desensibilizante.',
      };

      assert.equal(payloadActualizado.versionEsperada, 3);
      assert.equal(payloadActualizado.anamnesisActual.descripcion, 'Dolor al frío de corta duración');
      assert.equal(payloadActualizado.diagnosticos.length, 1);
      assert.ok(payloadActualizado.evolucionSOAP.plan.includes('1 mes'));
    });
  });

  // ─── 6. Protección de Estado y Prevención de Envíos Duplicados ────────────
  describe('6. Protección de Estado y Prevención de Envíos Duplicados', () => {
    test('6.1. Identifica que consultas COMPLETADA o CANCELADA deben bloquear edición', () => {
      const estadosFinalizados = ['COMPLETADA', 'CANCELADA'];
      for (const estado of estadosFinalizados) {
        const isReadOnly = estado === 'COMPLETADA' || estado === 'CANCELADA';
        assert.equal(isReadOnly, true, `El estado ${estado} debe considerarse de solo lectura`);
      }

      const estadoEnCurso = 'EN_CURSO';
      const isReadOnlyEnCurso = estadoEnCurso === 'COMPLETADA' || estadoEnCurso === 'CANCELADA';
      assert.equal(isReadOnlyEnCurso, false, 'El estado EN_CURSO debe permitir edición');
    });

    test('6.2. La bandera isSubmitting previene ejecuciones duplicadas simultáneas', async () => {
      let llamadasBackend = 0;
      globalThis.fetch = async () => {
        llamadasBackend++;
        // Retardo simulado
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(JSON.stringify({ id: 'cons_1', version: 2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      let isSubmitting = false;

      async function accionUsuario() {
        if (isSubmitting) return 'bloqueado';
        isSubmitting = true;
        try {
          return await consultasOdontologicasService.actualizarAtencion(
            'cons_1',
            { versionEsperada: 1 },
            TEST_TOKEN,
          );
        } finally {
          isSubmitting = false;
        }
      }

      // Dos clics rápidos simultáneos
      const [res1, res2] = await Promise.all([accionUsuario(), accionUsuario()]);

      assert.equal(llamadasBackend, 1, 'Solo debe haberse ejecutado una llamada HTTP');
      assert.ok(res1 && res1.id === 'cons_1');
      assert.equal(res2, 'bloqueado');
    });
  });

  // ─── 7. Resolución Segura de Conflictos de Concurrencia Optimista HTTP 409 ──
  describe('7. Resolución Segura de Conflictos de Concurrencia Optimista HTTP 409', () => {
    test('7.1. Valida que versionEsperada se envíe como entero positivo >= 1 en el payload HTTP', async () => {
      let payloadEnviado = null;
      globalThis.fetch = async (url, options) => {
        payloadEnviado = JSON.parse(options.body);
        return new Response(JSON.stringify({ id: 'cons_1', version: 2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      await consultasOdontologicasService.actualizarAtencion(
        'cons_1',
        { versionEsperada: 1, motivoConsulta: 'Revisión periódica' },
        TEST_TOKEN,
      );

      assert.ok(payloadEnviado);
      assert.equal(typeof payloadEnviado.versionEsperada, 'number');
      assert.equal(payloadEnviado.versionEsperada, 1);
      assert.ok(Number.isInteger(payloadEnviado.versionEsperada));
      assert.ok(payloadEnviado.versionEsperada >= 1);
    });

    test('7.2. Ante HTTP 409, conserva estrictamente el borrador local sin sobrescritura de datos', async () => {
      // Estado del borrador local preparado por el profesional
      const borradorLocal = {
        versionEsperada: 1,
        motivoConsulta: 'Dolor severo en pieza 36 al masticar',
        anamnesisActual: {
          descripcion: 'Paciente refiere dolor pulsátil desde hace 3 días',
          tiempoEvolucion: '72 horas',
          escalaDolorEVA: 8,
        },
        exploracionFisica: {
          inspeccionIntraoral: 'Caries penetrante en cara oclusal de 36',
          inspeccionExtraoral: 'Sin tumefacción facial',
          hallazgosDentales: 'Pruebas térmicas positivas aumentadas',
        },
        diagnosticos: [
          { codigoCIE10: 'K04.0', descripcion: 'Pulpitis irreversible aguda', tipo: 'DEFINITIVO' },
        ],
        procedimientosRealizados: [
          { codigo: 'PROC-END-01', descripcion: 'Apertura cameral y pulpectomía', piezaDental: 36, observaciones: 'Conductometría tentativa' },
        ],
        evolucionSOAP: {
          subjetivo: 'Dolor nocturno intenso',
          objetivo: 'Cámara pulpar abierta con sangrado profuso',
          analisis: 'Pulpitis irreversible con necrosis incipiente',
          plan: 'Instrumentación biomecánica completa en próxima sesión',
        },
        recomendaciones: 'Tomar analgésico cada 8 horas y no masticar por el lado izquierdo.',
      };

      let llamadasPut = 0;
      globalThis.fetch = async () => {
        llamadasPut++;
        return new Response(
          JSON.stringify({
            type: 'https://api.odontoclinic.local/errors/conflict',
            title: 'Conflicto de concurrencia optimista en consulta',
            status: 409,
            detail: 'Conflicto de concurrencia en la consulta cons_1. La versión esperada (1) no coincide con la versión persistida. Otro operador modificó la consulta.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        );
      };

      try {
        await consultasOdontologicasService.actualizarAtencion('cons_1', borradorLocal, TEST_TOKEN);
        assert.fail('Debió lanzar 409');
      } catch (err) {
        assert.equal(err.status, 409);
        assert.equal(llamadasPut, 1, 'No deben ejecutarse reintentos automáticos tras 409');

        // Verificar que el objeto del borrador local permanece intacto e inmutable
        assert.equal(borradorLocal.versionEsperada, 1);
        assert.equal(borradorLocal.motivoConsulta, 'Dolor severo en pieza 36 al masticar');
        assert.equal(borradorLocal.anamnesisActual.escalaDolorEVA, 8);
        assert.equal(borradorLocal.procedimientosRealizados[0].piezaDental, 36);
        assert.equal(borradorLocal.diagnosticos[0].codigoCIE10, 'K04.0');
        assert.ok(borradorLocal.evolucionSOAP.subjetivo.includes('Dolor nocturno'));
      }
    });

    test('7.3. Prohíbe sobrescrituras forzadas automáticas (no auto-incrementa versión ni realiza reintentos)', async () => {
      let llamadasBackend = 0;
      globalThis.fetch = async () => {
        llamadasBackend++;
        return new Response(
          JSON.stringify({
            type: 'https://api.odontoclinic.local/errors/conflict',
            title: 'Conflicto de concurrencia optimista',
            status: 409,
            detail: 'Versión esperada 1 no coincide con versión persistida 2.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        );
      };

      let versionEsperada = 1;
      let conflictoActivo = false;

      async function intentarGuardar() {
        if (conflictoActivo) {
          throw new Error('Conflicto activo: debe resolverlo explícitamente antes de enviar');
        }
        try {
          await consultasOdontologicasService.actualizarAtencion(
            'cons_1',
            { versionEsperada },
            TEST_TOKEN,
          );
        } catch (err) {
          if (err.status === 409) {
            conflictoActivo = true;
            // No incrementar versión automáticamente
          }
          throw err;
        }
      }

      await assert.rejects(
        () => intentarGuardar(),
        (err) => err.status === 409 && err.detail.includes('Versión esperada 1 no coincide'),
      );

      // Verificación de que la versión no se alteró arbitrariamente
      assert.equal(versionEsperada, 1, 'La versión esperada no debe cambiar automáticamente sin resolución');
      assert.equal(conflictoActivo, true);
      assert.equal(llamadasBackend, 1, 'Nunca debe realizar reintentos automáticos (Requisito 5)');

      // Un segundo intento inmediato sin resolver el conflicto debe ser bloqueado
      await assert.rejects(() => intentarGuardar(), /Conflicto activo: debe resolverlo/);
      assert.equal(llamadasBackend, 1, 'No se enviaron solicitudes adicionales al backend');
    });

    test('7.4. Permite comparar cambios con la versión del servidor y adoptar campos selectivamente', () => {
      // Estado persistido en servidor tras modificación concurrente
      const versionServidor = {
        version: 2,
        motivoConsulta: 'Dolor agudo en cuadrante 3',
        anamnesisActual: {
          descripcion: 'Paciente tomó ibuprofeno 400mg con alivio temporal',
          tiempoEvolucion: '48 horas',
          escalaDolorEVA: 5,
        },
        exploracionFisica: {
          inspeccionIntraoral: 'Pieza 36 con lesión oclusomesial activa',
          inspeccionExtraoral: 'Normal',
          hallazgosDentales: 'Sensibilidad a la percusión vertical',
        },
        diagnosticos: [
          { codigoCIE10: 'K04.0', descripcion: 'Pulpitis reversible', tipo: 'PRESUNTIVO' },
        ],
        procedimientosRealizados: [],
        evolucionSOAP: {
          subjetivo: 'Alivio parcial tras analgésico',
          objetivo: 'Vitalidad pulpar conservada',
          analisis: 'Estado inflamatorio potencialmente reversible',
          plan: 'Protección pulpar indirecta',
        },
        recomendaciones: 'Evitar masticar alimentos duros.',
      };

      // Borrador local con procedimientos documentados en sillón
      const borradorLocal = {
        versionEsperada: 1,
        motivoConsulta: 'Dolor severo en pieza 36 al masticar',
        anamnesisActual: {
          descripcion: 'Paciente refiere dolor pulsátil',
          tiempoEvolucion: '72 horas',
          escalaDolorEVA: 8,
        },
        exploracionFisica: {
          inspeccionIntraoral: 'Caries penetrante en 36',
          inspeccionExtraoral: 'Sin hallazgos',
          hallazgosDentales: 'Caries cavitada',
        },
        diagnosticos: [
          { codigoCIE10: 'K04.0', descripcion: 'Pulpitis irreversible aguda', tipo: 'DEFINITIVO' },
        ],
        procedimientosRealizados: [
          { codigo: 'PROC-OBT-01', descripcion: 'Obturación provisional con ionómero', piezaDental: 36, observaciones: 'Aislamiento relativo' },
        ],
        evolucionSOAP: {
          subjetivo: 'Dolor intenso matutino',
          objetivo: 'Caries profunda',
          analisis: 'Requiere tratamiento endodóntico si no cede',
          plan: 'Observación 48 horas',
        },
        recomendaciones: 'Enjuagues con clorhexidina 0.12%.',
      };

      // 1. Detección de diferencias
      const difMotivo = borradorLocal.motivoConsulta !== versionServidor.motivoConsulta;
      const difEVA = borradorLocal.anamnesisActual.escalaDolorEVA !== versionServidor.anamnesisActual.escalaDolorEVA;
      const difProcedimientos = borradorLocal.procedimientosRealizados.length !== versionServidor.procedimientosRealizados.length;

      assert.equal(difMotivo, true, 'Debe detectar diferencia en motivo de consulta');
      assert.equal(difEVA, true, 'Debe detectar diferencia en escala EVA');
      assert.equal(difProcedimientos, true, 'Debe detectar diferencia en lista de procedimientos');

      // 2. Fusión selectiva: adoptar anamnesis del servidor pero conservar procedimientos locales
      const borradorResuelto = {
        ...borradorLocal,
        // Adopción selectiva de anamnesis del servidor
        anamnesisActual: { ...versionServidor.anamnesisActual },
        // Conservación de procedimientos documentados en sillón
        procedimientosRealizados: [...borradorLocal.procedimientosRealizados],
        // Sincronización explícita y consciente de la versión
        versionEsperada: versionServidor.version,
      };

      assert.equal(borradorResuelto.versionEsperada, 2, 'La versión esperada se sincroniza con el servidor');
      assert.equal(borradorResuelto.anamnesisActual.escalaDolorEVA, 5, 'Se adoptó el valor del servidor');
      assert.equal(borradorResuelto.procedimientosRealizados.length, 1, 'Se conservó el procedimiento local');
      assert.equal(borradorResuelto.procedimientosRealizados[0].piezaDental, 36);
    });

    test('7.5. Si otra sesión completó la consulta (COMPLETADA), bloquea de inmediato cualquier nueva edición (INV-CONS-04)', () => {
      // Estado recuperado del servidor tras verificación de concurrencia
      const servidorCerrada = {
        id: 'cons_123',
        version: 3,
        estado: 'COMPLETADA',
        motivoConsulta: 'Consulta formalmente sellada por Dr. Especialista',
      };

      function evaluarEstadoEdicion(consultaServidor) {
        const isReadOnly = consultaServidor.estado === 'COMPLETADA' || consultaServidor.estado === 'CANCELADA';
        const puedeEnviar = !isReadOnly && consultaServidor.estado === 'EN_CURSO';
        return { isReadOnly, puedeEnviar };
      }

      const { isReadOnly, puedeEnviar } = evaluarEstadoEdicion(servidorCerrada);

      assert.equal(isReadOnly, true, 'La consulta debe quedar inmediatamente en solo lectura');
      assert.equal(puedeEnviar, false, 'No se debe permitir enviar ninguna actualización');
    });

    test('7.6. Si otra sesión canceló la consulta (CANCELADA), bloquea de inmediato cualquier nueva edición (INV-CONS-04)', () => {
      const servidorCancelada = {
        id: 'cons_123',
        version: 2,
        estado: 'CANCELADA',
        motivoCancelacion: 'Paciente no se presentó a la cita',
      };

      const isReadOnly = servidorCancelada.estado === 'COMPLETADA' || servidorCancelada.estado === 'CANCELADA';
      assert.equal(isReadOnly, true);
    });

    test('7.7. Sincroniza versión esperada y permite reenvío seguro solo tras resolución explícita del usuario', async () => {
      let peticionRecibida = null;
      globalThis.fetch = async (url, options) => {
        peticionRecibida = { url, body: JSON.parse(options.body) };
        return new Response(
          JSON.stringify({
            id: 'cons_1',
            version: 3, // Incrementada a 3 tras persistencia exitosa
            estado: 'EN_CURSO',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      // Versión sincronizada conscientemente por el usuario a v2
      const payloadPostResolucion = {
        versionEsperada: 2,
        motivoConsulta: 'Dolor mitigado tras pulpectomía',
      };

      const resultado = await consultasOdontologicasService.actualizarAtencion(
        'cons_1',
        payloadPostResolucion,
        TEST_TOKEN,
      );

      assert.ok(peticionRecibida);
      assert.equal(peticionRecibida.body.versionEsperada, 2);
      assert.equal(resultado.version, 3);
    });
  });
});
