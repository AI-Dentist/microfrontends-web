import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { historiasClinicasService } from '../src/api/historias-clinicas.service.js';
import { DEV_IDENTITIES } from '../src/hooks/dev-identities.js';

// Usar token de desarrollo autorizado
const token = DEV_IDENTITIES[0].token; // 'token_dev_henry'

describe('Iteración 5C — Gestión Clínica (Alergias, Medicamentos, Estado y Concurrencia)', () => {
  let historiaId;
  let pacienteSinteticoId;

  before(async () => {
    // Verificar conectividad al backend
    const health = await historiasClinicasService.getHealth();
    assert.equal(health.status, 'ok', 'Microservicio MS2 debe reportar status ok');
    assert.equal(health.database, 'connected', 'MongoDB debe estar conectado');

    // Crear un expediente sintético exclusivo para las pruebas de la Iteración 5C
    pacienteSinteticoId = `pac_test_5c_${Date.now()}`;
    const nuevaHistoria = await historiasClinicasService.create(
      {
        pacienteId: pacienteSinteticoId,
        odontologoResponsableId: 'od_henry_principal',
        observacionesGenerales: 'Expediente sintético para verificación de Iteración 5C.',
      },
      token,
    );

    assert.ok(nuevaHistoria.id, 'Debe crearse un ID canónico de historia clínica');
    assert.equal(nuevaHistoria.version, 1, 'La versión inicial debe ser 1');
    assert.equal(nuevaHistoria.estado, 'ACTIVA', 'El estado inicial debe ser ACTIVA');
    historiaId = nuevaHistoria.id;
  });

  // 1. Agregar alergia exitosamente
  test('1. Agregar alergia exitosamente', async () => {
    const actualizada = await historiasClinicasService.agregarAlergia(
      historiaId,
      {
        versionEsperada: 1,
        sustancia: 'Penicilina',
        tipoReaccion: 'Shock anafiláctico / Urticaria severa',
        severidad: 'GRAVE',
        notasAdicionales: 'Reacción en la infancia. Evitar todo betalactámico.',
        descripcion: 'Reportado por el paciente en anamnesis inicial.',
      },
      token,
    );

    assert.equal(actualizada.version, 2, 'La versión debe incrementarse a 2');
    assert.equal(actualizada.alergias.length, 1, 'Debe tener 1 alergia registrada');
    assert.equal(actualizada.alergias[0].sustancia, 'Penicilina');
    assert.equal(actualizada.alergias[0].severidad, 'GRAVE');
  });

  // 2. Rechazar alergia duplicada
  test('2. Rechazar alergia duplicada (case-insensitive)', async () => {
    let errorCapturado = null;
    try {
      await historiasClinicasService.agregarAlergia(
        historiaId,
        {
          versionEsperada: 2,
          sustancia: 'penicilina', // Mismo nombre con minúsculas
          tipoReaccion: 'Erupción leve',
          severidad: 'LEVE',
          descripcion: 'Intento de registro duplicado',
        },
        token,
      );
    } catch (err) {
      errorCapturado = err;
    }

    assert.ok(errorCapturado, 'Debe lanzar un error por alergia duplicada');
    assert.equal(
      errorCapturado.status,
      422,
      'El backend debe responder con 422 Unprocessable Entity',
    );
    assert.match(
      errorCapturado.detail || errorCapturado.title,
      /penicilina/i,
      'El mensaje debe identificar la sustancia duplicada',
    );
  });

  // 3. Eliminar una alergia existente
  test('3. Eliminar una alergia existente', async () => {
    // Primero agregamos una segunda alergia para luego eliminar Penicilina
    const conDosAlergias = await historiasClinicasService.agregarAlergia(
      historiaId,
      {
        versionEsperada: 2,
        sustancia: 'Látex',
        tipoReaccion: 'Dermatitis de contacto',
        severidad: 'MODERADA',
        notasAdicionales: 'Uso de guantes de nitrilo obligatorio.',
        descripcion: 'Prueba de alergia positiva.',
      },
      token,
    );
    assert.equal(conDosAlergias.version, 3, 'Versión debe ser 3');
    assert.equal(conDosAlergias.alergias.length, 2, 'Debe tener 2 alergias');

    // Ahora eliminamos Penicilina
    const trasEliminar = await historiasClinicasService.eliminarAlergia(
      historiaId,
      'Penicilina',
      {
        versionEsperada: 3,
        descripcion: 'Prueba posterior de provocación descartó alergia.',
      },
      token,
    );

    assert.equal(trasEliminar.version, 4, 'La versión debe incrementarse a 4');
    assert.equal(trasEliminar.alergias.length, 1, 'Debe quedar exactamente 1 alergia');
    assert.equal(trasEliminar.alergias[0].sustancia, 'Látex');
  });

  // 4. Actualizar medicamentos
  test('4. Actualizar medicamentos (reemplazo del esquema)', async () => {
    const actualizada = await historiasClinicasService.actualizarMedicamentos(
      historiaId,
      {
        versionEsperada: 4,
        medicamentos: [
          {
            nombre: 'Losartán 50mg',
            principioActivo: 'Losartán potásico',
            dosis: '1 comprimido cada 24 horas',
            motivoUso: 'Hipertensión arterial estadio 1',
            prescritoDesde: '2023-01-15T00:00:00.000Z',
          },
          {
            nombre: 'Amoxicilina 500mg',
            principioActivo: 'Amoxicilina trihidrato',
            dosis: '1 cápsula cada 8 horas',
            motivoUso: 'Profilaxis dental previa',
            prescritoDesde: null,
          },
        ],
        descripcion: 'Registro de medicamentos habituales del paciente.',
      },
      token,
    );

    assert.equal(actualizada.version, 5, 'La versión debe incrementarse a 5');
    assert.equal(actualizada.medicamentosActuales.length, 2, 'Debe tener 2 medicamentos');
    assert.equal(actualizada.medicamentosActuales[0].nombre, 'Losartán 50mg');
    assert.equal(actualizada.medicamentosActuales[1].nombre, 'Amoxicilina 500mg');
  });

  // 5. Confirmar que PUT conserva los medicamentos que no se eliminaron
  test('5. Confirmar que PUT conserva los medicamentos no eliminados y quita los descartados', async () => {
    // Conservamos Losartán, removemos Amoxicilina y agregamos Omeprazol
    const actualizada = await historiasClinicasService.actualizarMedicamentos(
      historiaId,
      {
        versionEsperada: 5,
        medicamentos: [
          {
            nombre: 'Losartán 50mg',
            principioActivo: 'Losartán potásico',
            dosis: '1 comprimido cada 24 horas',
            motivoUso: 'Hipertensión arterial estadio 1',
            prescritoDesde: '2023-01-15T00:00:00.000Z',
          },
          {
            nombre: 'Omeprazol 20mg',
            principioActivo: 'Omeprazol magnésico',
            dosis: '1 cápsula en ayunas',
            motivoUso: 'Gastritis erosiva leve',
            prescritoDesde: '2024-03-01T00:00:00.000Z',
          },
        ],
        descripcion: 'Culminación de tratamiento con amoxicilina y adición de omeprazol.',
      },
      token,
    );

    assert.equal(actualizada.version, 6, 'La versión debe incrementarse a 6');
    assert.equal(actualizada.medicamentosActuales.length, 2, 'Debe tener 2 medicamentos');
    assert.ok(
      actualizada.medicamentosActuales.some((m) => m.nombre === 'Losartán 50mg'),
      'Losartán debe conservarse',
    );
    assert.ok(
      actualizada.medicamentosActuales.some((m) => m.nombre === 'Omeprazol 20mg'),
      'Omeprazol debe estar presente',
    );
    assert.ok(
      !actualizada.medicamentosActuales.some((m) => m.nombre === 'Amoxicilina 500mg'),
      'Amoxicilina debe haber sido removida del esquema',
    );
  });

  // 6. Cambiar estado mediante una transición permitida
  test('6. Cambiar estado mediante una transición permitida (ACTIVA -> CERRADA)', async () => {
    const actualizada = await historiasClinicasService.cambiarEstado(
      historiaId,
      {
        versionEsperada: 6,
        nuevoEstado: 'CERRADA',
        descripcion: 'Cierre del expediente clínico por culminación satisfactoria del tratamiento.',
      },
      token,
    );

    assert.equal(actualizada.version, 7, 'La versión debe incrementarse a 7');
    assert.equal(actualizada.estado, 'CERRADA', 'El estado destino debe ser CERRADA');
  });

  // 7. Rechazar una transición inválida
  test('7. Rechazar una transición inválida', async () => {
    let errorCapturado = null;
    try {
      await historiasClinicasService.cambiarEstado(
        historiaId,
        {
          versionEsperada: 7,
          nuevoEstado: 'CERRADA', // De CERRADA a CERRADA no es una transición válida
          descripcion: 'Intento de transición redundante o prohibida',
        },
        token,
      );
    } catch (err) {
      errorCapturado = err;
    }

    assert.ok(errorCapturado, 'Debe lanzar error al solicitar transición inválida');
    assert.equal(
      errorCapturado.status,
      422,
      'Backend debe responder con 422 Transición inválida',
    );
  });

  // 8. Impedir edición de un expediente no editable
  test('8. Impedir edición de antecedentes, alergias o fármacos en expediente no editable (CERRADA)', async () => {
    let errorCapturado = null;
    try {
      await historiasClinicasService.agregarAlergia(
        historiaId,
        {
          versionEsperada: 7,
          sustancia: 'Ibuprofeno',
          tipoReaccion: 'Broncoespasmo',
          severidad: 'GRAVE',
        },
        token,
      );
    } catch (err) {
      errorCapturado = err;
    }

    assert.ok(errorCapturado, 'Debe lanzar error al intentar editar expediente CERRADO');
    assert.equal(
      errorCapturado.status,
      422,
      'Backend debe responder con 422 Expediente no editable',
    );
    assert.match(
      errorCapturado.detail || errorCapturado.title,
      /CERRADA|editable/i,
      'El detalle debe indicar que el expediente no es editable en estado CERRADA',
    );
  });

  // 9. Detectar un conflicto de versión 409
  test('9. Detectar un conflicto de versión 409 (optimistic concurrency)', async () => {
    // Primero reabrimos la historia a ACTIVA (transición permitida de CERRADA a ACTIVA)
    const reactivada = await historiasClinicasService.cambiarEstado(
      historiaId,
      {
        versionEsperada: 7,
        nuevoEstado: 'ACTIVA',
        descripcion: 'Reapertura para nueva fase de tratamiento.',
      },
      token,
    );
    assert.equal(reactivada.version, 8, 'Versión incrementada a 8 tras reactivación');
    assert.equal(reactivada.estado, 'ACTIVA');

    // Ahora intentamos agregar una alergia enviando una versión desactualizada (ej. versionEsperada: 1)
    let errorCapturado = null;
    try {
      await historiasClinicasService.agregarAlergia(
        historiaId,
        {
          versionEsperada: 1, // Desactualizada: el servidor está en v8
          sustancia: 'Aspirina',
          tipoReaccion: 'Urticaria',
          severidad: 'MODERADA',
        },
        token,
      );
    } catch (err) {
      errorCapturado = err;
    }

    assert.ok(errorCapturado, 'Debe lanzar conflicto de concurrencia optimista');
    assert.equal(
      errorCapturado.status,
      409,
      'Backend debe responder con HTTP 409 Conflict',
    );
  });

  // 10. Recuperar y visualizar la historia clínica actualizada
  test('10. Recuperar y visualizar la historia clínica actualizada con auditoría completa', async () => {
    const recuperada = await historiasClinicasService.getById(historiaId, token);

    assert.equal(recuperada.id, historiaId);
    assert.equal(recuperada.pacienteId, pacienteSinteticoId);
    assert.equal(recuperada.estado, 'ACTIVA');
    assert.equal(recuperada.version, 8, 'Versión consolidada v8');
    assert.equal(recuperada.alergias.length, 1, 'Debe conservar 1 alergia (Látex)');
    assert.equal(recuperada.alergias[0].sustancia, 'Látex');
    assert.equal(recuperada.medicamentosActuales.length, 2, 'Debe conservar 2 medicamentos');

    // Verificar que el historial de auditoría contiene todos los eventos ejecutados
    assert.ok(recuperada.historialCambios.length >= 7, 'Debe haber registrado todos los cambios en auditoría');
    const acciones = recuperada.historialCambios.map((h) => h.accion);
    assert.ok(acciones.includes('ADICION_ALERGIA'), 'Debe registrar ADICION_ALERGIA');
    assert.ok(acciones.includes('ELIMINACION_ALERGIA'), 'Debe registrar ELIMINACION_ALERGIA');
    assert.ok(acciones.includes('ACTUALIZACION_MEDICAMENTOS'), 'Debe registrar ACTUALIZACION_MEDICAMENTOS');
    assert.ok(acciones.includes('CAMBIO_ESTADO'), 'Debe registrar CAMBIO_ESTADO');
  });
});
