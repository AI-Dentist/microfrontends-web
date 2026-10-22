import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { historiasClinicasService } from '../src/api/historias-clinicas.service.js';
import { httpClient } from '../src/api/client.js';

const TOKEN_HENRY = 'token_dev_henry';
const TOKEN_INVALIDO = 'token_invalido_test';

describe('Iteración 5D — Auditoría Funcional y Estabilización (clinica-dentalDB-audit)', () => {
  const pacienteId = `pac_audit_5d_${Date.now()}`;
  let historiaId;
  let versionActual = 1;

  // 1. Creación de historia clínica
  test('1. Creación de historia clínica sintética', async () => {
    const creada = await historiasClinicasService.create(
      {
        pacienteId,
        odontologoResponsableId: 'od_henry_principal',
        observacionesGenerales: 'Auditoría 5D: Apertura de expediente sintético.',
        antecedentes: {
          enfermedadesCronicas: [],
          antecedentesMedicos: [],
          antecedentesFamiliares: [],
          antecedentesOdontologicos: {
            tratamientoPrevio: { estado: 'CONFIRMADO', detalle: 'Ortodoncia culminada en 2022' },
            protesisActual: { estado: 'NEGADO', detalle: null },
            sangradoGingival: { estado: 'NO_EVALUADO', detalle: null },
            bruxismo: { estado: 'CONFIRMADO', detalle: 'Bruxismo céntrico nocturno' },
          },
        },
      },
      TOKEN_HENRY,
    );

    assert.ok(creada.id);
    assert.equal(creada.pacienteId, pacienteId);
    assert.equal(creada.estado, 'ACTIVA');
    assert.equal(creada.version, 1);
    historiaId = creada.id;
    versionActual = creada.version;
  });

  // 2. Consulta por ID
  test('2. Consulta por ID canónico', async () => {
    const encontrada = await historiasClinicasService.getById(historiaId, TOKEN_HENRY);
    assert.equal(encontrada.id, historiaId);
    assert.equal(encontrada.pacienteId, pacienteId);
    assert.equal(encontrada.version, versionActual);
  });

  // 3. Consulta por paciente
  test('3. Consulta por identificador de paciente', async () => {
    const encontrada = await historiasClinicasService.getByPacienteId(pacienteId, TOKEN_HENRY);
    assert.equal(encontrada.id, historiaId);
    assert.equal(encontrada.pacienteId, pacienteId);
  });

  // 4. Actualización de antecedentes
  test('4. Actualización de antecedentes personales', async () => {
    const actualizada = await historiasClinicasService.updateAntecedentes(
      historiaId,
      {
        versionEsperada: versionActual,
        nuevosAntecedentes: {
          enfermedadesCronicas: [
            { nombre: 'Hipertensión', estado: 'CONFIRMADO', detalle: 'Controlada con fármacos' },
          ],
          antecedentesMedicos: [],
          antecedentesFamiliares: [],
          antecedentesOdontologicos: {
            tratamientoPrevio: { estado: 'CONFIRMADO', detalle: 'Ortodoncia previa' },
            protesisActual: { estado: 'NEGADO', detalle: null },
            sangradoGingival: { estado: 'NEGADO', detalle: null },
            bruxismo: { estado: 'CONFIRMADO', detalle: 'Usa férula de descarga' },
          },
        },
        camposModificados: ['enfermedadesCronicas', 'antecedentesOdontologicos.sangradoGingival'],
        descripcion: 'Actualización en control semestral.',
      },
      TOKEN_HENRY,
    );

    assert.equal(actualizada.version, versionActual + 1);
    versionActual = actualizada.version;
    assert.equal(actualizada.antecedentes.enfermedadesCronicas.length, 1);
    assert.equal(actualizada.antecedentes.enfermedadesCronicas[0].nombre, 'Hipertensión');
  });

  // 5. Agregar alergia
  test('5. Agregar alergia con severidad', async () => {
    const actualizada = await historiasClinicasService.agregarAlergia(
      historiaId,
      {
        versionEsperada: versionActual,
        sustancia: 'Ketorolaco',
        tipoReaccion: 'Edema facial y broncoespasmo',
        severidad: 'GRAVE',
        notasAdicionales: 'Evitar AINEs de la familia del ácido acético.',
        descripcion: 'Reacción adversa referida.',
      },
      TOKEN_HENRY,
    );

    assert.equal(actualizada.version, versionActual + 1);
    versionActual = actualizada.version;
    assert.equal(actualizada.alergias.length, 1);
    assert.equal(actualizada.alergias[0].sustancia, 'Ketorolaco');
    assert.equal(actualizada.alergias[0].severidad, 'GRAVE');
  });

  // 6. Detectar alergia duplicada
  test('6. Detectar alergia duplicada (422 Unprocessable Entity)', async () => {
    let errorCapturado = null;
    try {
      await historiasClinicasService.agregarAlergia(
        historiaId,
        {
          versionEsperada: versionActual,
          sustancia: 'ketorolaco', // case-insensitive duplicate
          tipoReaccion: 'Urticaria',
          severidad: 'MODERADA',
        },
        TOKEN_HENRY,
      );
    } catch (err) {
      errorCapturado = err;
    }

    assert.ok(errorCapturado);
    assert.equal(errorCapturado.status, 422);
    assert.match(errorCapturado.detail || errorCapturado.title, /ketorolaco/i);
  });

  // 7. Eliminar alergia
  test('7. Eliminar alergia registrada', async () => {
    const actualizada = await historiasClinicasService.eliminarAlergia(
      historiaId,
      'Ketorolaco',
      {
        versionEsperada: versionActual,
        descripcion: 'Descartada tras prueba dérmica en alergología.',
      },
      TOKEN_HENRY,
    );

    assert.equal(actualizada.version, versionActual + 1);
    versionActual = actualizada.version;
    assert.equal(actualizada.alergias.length, 0);
  });

  // 8. Actualizar medicamentos
  test('8. Actualizar medicamentos iniciales', async () => {
    const actualizada = await historiasClinicasService.actualizarMedicamentos(
      historiaId,
      {
        versionEsperada: versionActual,
        medicamentos: [
          {
            nombre: 'Clorhexidina 0.12%',
            principioActivo: 'Digluconato de clorhexidina',
            dosis: 'Enjuague cada 12 horas por 7 días',
            motivoUso: 'Gingivitis localizada',
            prescritoDesde: '2026-10-01T00:00:00.000Z',
          },
          {
            nombre: 'Paracetamol 500mg',
            principioActivo: 'Paracetamol',
            dosis: '1 comprimido cada 8 horas si hay dolor',
            motivoUso: 'Molestia postratamiento',
            prescritoDesde: null,
          },
        ],
        descripcion: 'Esquema postoperatorio.',
      },
      TOKEN_HENRY,
    );

    assert.equal(actualizada.version, versionActual + 1);
    versionActual = actualizada.version;
    assert.equal(actualizada.medicamentosActuales.length, 2);
  });

  // 9. Conservar medicamentos existentes no eliminados (PUT idempotente)
  test('9. Conservar medicamentos no eliminados en PUT', async () => {
    // Conservamos Clorhexidina, quitamos Paracetamol y añadimos Ketoprofeno
    const actualizada = await historiasClinicasService.actualizarMedicamentos(
      historiaId,
      {
        versionEsperada: versionActual,
        medicamentos: [
          {
            nombre: 'Clorhexidina 0.12%',
            principioActivo: 'Digluconato de clorhexidina',
            dosis: 'Enjuague cada 12 horas por 7 días',
            motivoUso: 'Gingivitis localizada',
            prescritoDesde: '2026-10-01T00:00:00.000Z',
          },
          {
            nombre: 'Ketoprofeno 50mg',
            principioActivo: 'Ketoprofeno',
            dosis: '1 cápsula cada 12 horas con alimentos',
            motivoUso: 'Antiinflamatorio',
            prescritoDesde: '2026-10-22T00:00:00.000Z',
          },
        ],
        descripcion: 'Ajuste analgésico.',
      },
      TOKEN_HENRY,
    );

    assert.equal(actualizada.version, versionActual + 1);
    versionActual = actualizada.version;
    assert.equal(actualizada.medicamentosActuales.length, 2);
    assert.ok(actualizada.medicamentosActuales.some((m) => m.nombre === 'Clorhexidina 0.12%'));
    assert.ok(actualizada.medicamentosActuales.some((m) => m.nombre === 'Ketoprofeno 50mg'));
    assert.ok(!actualizada.medicamentosActuales.some((m) => m.nombre === 'Paracetamol 500mg'));
  });

  // 10. Cerrar expediente
  test('10. Cerrar expediente (ACTIVA -> CERRADA)', async () => {
    const actualizada = await historiasClinicasService.cambiarEstado(
      historiaId,
      {
        versionEsperada: versionActual,
        nuevoEstado: 'CERRADA',
        descripcion: 'Alta médica por culminación de tratamiento odontológico.',
      },
      TOKEN_HENRY,
    );

    assert.equal(actualizada.version, versionActual + 1);
    versionActual = actualizada.version;
    assert.equal(actualizada.estado, 'CERRADA');
  });

  // 11. Reabrir expediente cerrado
  test('11. Reabrir expediente cerrado (CERRADA -> ACTIVA)', async () => {
    const actualizada = await historiasClinicasService.cambiarEstado(
      historiaId,
      {
        versionEsperada: versionActual,
        nuevoEstado: 'ACTIVA',
        descripcion: 'Reapertura para nueva fase de rehabilitación protésica.',
      },
      TOKEN_HENRY,
    );

    assert.equal(actualizada.version, versionActual + 1);
    versionActual = actualizada.version;
    assert.equal(actualizada.estado, 'ACTIVA');
  });

  // 12. Archivar expediente
  test('12. Archivar expediente (ACTIVA -> ARCHIVADA)', async () => {
    const actualizada = await historiasClinicasService.cambiarEstado(
      historiaId,
      {
        versionEsperada: versionActual,
        nuevoEstado: 'ARCHIVADA',
        descripcion: 'Custodia legal definitiva de expediente.',
      },
      TOKEN_HENRY,
    );

    assert.equal(actualizada.version, versionActual + 1);
    versionActual = actualizada.version;
    assert.equal(actualizada.estado, 'ARCHIVADA');
  });

  // 13. Bloquear modificaciones en expedientes no editables (ARCHIVADA)
  test('13. Bloquear modificaciones en expediente ARCHIVADA (422)', async () => {
    let errorCapturado = null;
    try {
      await historiasClinicasService.agregarAlergia(
        historiaId,
        {
          versionEsperada: versionActual,
          sustancia: 'Metronidazol',
          tipoReaccion: 'Náuseas',
          severidad: 'LEVE',
        },
        TOKEN_HENRY,
      );
    } catch (err) {
      errorCapturado = err;
    }

    assert.ok(errorCapturado);
    assert.equal(errorCapturado.status, 422);
    assert.match(errorCapturado.detail || errorCapturado.title, /ARCHIVADA|editable/i);
  });

  // 14. Mostrar correctamente el historial de auditoría
  test('14. Historial de auditoría completo y cronológico', async () => {
    const final = await historiasClinicasService.getById(historiaId, TOKEN_HENRY);

    assert.ok(final.historialCambios.length >= 7, 'Debe haber acumulado al menos 7 movimientos de auditoría');
    const acciones = final.historialCambios.map((h) => h.accion);
    assert.ok(acciones.includes('CREACION'));
    assert.ok(acciones.includes('ACTUALIZACION_ANTECEDENTES'));
    assert.ok(acciones.includes('ADICION_ALERGIA'));
    assert.ok(acciones.includes('ELIMINACION_ALERGIA'));
    assert.ok(acciones.includes('ACTUALIZACION_MEDICAMENTOS'));
    assert.ok(acciones.includes('CAMBIO_ESTADO'));

    // Verificar que cada entrada tiene odontólogo y fecha
    final.historialCambios.forEach((h) => {
      assert.ok(h.odontologoId);
      assert.ok(h.fechaHora);
    });
  });

  // 15. Verificación de códigos de error HTTP (400, 401, 404, 409, 422)
  test('15. Verificación de códigos de error HTTP bajo RFC 7807', async () => {
    // 400 Bad Request (parámetros faltantes en query)
    let err400 = null;
    try {
      await httpClient('/historias-clinicas?pacienteId=', { token: TOKEN_HENRY });
    } catch (err) {
      err400 = err;
    }
    assert.ok(err400, 'Debe fallar sin pacienteId');
    assert.equal(err400.status, 400);

    // 401 Unauthorized (token inválido o rechazado)
    let err401 = null;
    try {
      await historiasClinicasService.getById(historiaId, TOKEN_INVALIDO);
    } catch (err) {
      err401 = err;
    }
    assert.ok(err401, 'Debe fallar con token inválido');
    assert.equal(err401.status, 401);

    // 404 Not Found (historia inexistente)
    let err404 = null;
    try {
      await historiasClinicasService.getById('hc_00000000-0000-0000-0000-000000000000', TOKEN_HENRY);
    } catch (err) {
      err404 = err;
    }
    assert.ok(err404, 'Debe fallar con ID inexistente');
    assert.equal(err404.status, 404);

    // 409 Conflict (concurrencia optimista con versión desactualizada sobre expediente activo)
    const activaParaConflicto = await historiasClinicasService.create(
      {
        pacienteId: `pac_conflict_${Date.now()}`,
        odontologoResponsableId: 'od_henry_principal',
      },
      TOKEN_HENRY,
    );
    // Avanzar la versión a v2
    await historiasClinicasService.agregarAlergia(
      activaParaConflicto.id,
      {
        versionEsperada: 1,
        sustancia: 'Polen',
        tipoReaccion: 'Rinitis',
        severidad: 'LEVE',
      },
      TOKEN_HENRY,
    );

    // Intentar modificar con versión obsoleta (versionEsperada: 1 cuando el servidor está en v2)
    let err409 = null;
    try {
      await historiasClinicasService.agregarAlergia(
        activaParaConflicto.id,
        {
          versionEsperada: 1, // Desactualizada
          sustancia: 'Acaros',
          tipoReaccion: 'Estornudos',
          severidad: 'LEVE',
        },
        TOKEN_HENRY,
      );
    } catch (err) {
      err409 = err;
    }
    assert.ok(err409, 'Debe fallar con versión desactualizada');
    assert.equal(err409.status, 409);

    // 422 Unprocessable Entity (transición inválida desde ARCHIVADA)
    let err422 = null;
    try {
      await historiasClinicasService.cambiarEstado(
        historiaId,
        {
          versionEsperada: versionActual,
          nuevoEstado: 'ACTIVA', // ARCHIVADA no permite ninguna transición
        },
        TOKEN_HENRY,
      );
    } catch (err) {
      err422 = err;
    }
    assert.ok(err422, 'Debe fallar transición desde ARCHIVADA');
    assert.equal(err422.status, 422);
  });
});
