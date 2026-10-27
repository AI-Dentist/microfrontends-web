/**
 * Utilidades puras para la construcción, validación y sanitización de payloads
 * de revisión del Odontograma Longitudinal (Iteración 7F-3B).
 *
 * Contrato backend de destino: RegistrarRevisionOdontogramaHttpDto
 * - versionEsperada: number (int >= 1)
 * - tipoRevision: 'NUEVA_OBSERVACION' | 'ENMIENDA_CORRECTIVA'
 * - consultaId?: string | null
 * - fechaObservacionClinica: string (ISO 8601)
 * - motivoRevision: string (1..500 caracteres)
 * - deltas: DeltaPiezaHttpDto[] (al menos 1 delta válido)
 * - revisionCorregidaId?: string | null
 * - aplicaAlEstadoActual: boolean
 *
 * Reglas estrictas de seguridad e integridad clínica:
 * - NO incluir odontologoId ni pacienteId (resueltos en backend por contexto/token).
 * - NO incluir historiaClinicaId en el body (resuelto por ruta URL y odontogramaId).
 * - NO auto-incrementar versionEsperada en el frontend.
 * - Deshabilitar o bloquear ENMIENDA_CORRECTIVA si no se dispone de snapshot histórico base (7F-4).
 * - Funciones 100% puras sin efectos secundarios ni llamadas a la red.
 */

import {
  TIPO_REVISION_ODONTOGRAMA,
  esNumeroFDIValido,
} from '../constants/odontograma.constants.js';

/**
 * Valida si una cadena de texto representa una fecha ISO 8601 válida.
 *
 * @param {string} dateStr
 * @returns {boolean}
 */
export function esFechaISO8601Valida(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  // Debe poder ser parseada por Date y coincidir con el estándar ISO
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  // Comprobación de formato básico ISO (ej. 2026-10-26T... o YYYY-MM-DD)
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(
    dateStr.trim(),
  );
}

/**
 * Valida los metadatos clínicos de una revisión antes de construir el payload.
 *
 * @param {object} metadatos
 * @param {string} metadatos.tipoRevision - 'NUEVA_OBSERVACION' | 'ENMIENDA_CORRECTIVA'
 * @param {string} metadatos.motivoRevision - Justificación clínica (1..500 chars)
 * @param {string} metadatos.fechaObservacionClinica - Fecha ISO 8601
 * @param {string|null} [metadatos.consultaId] - ID canónico opcional de la consulta
 * @param {string|null} [metadatos.revisionCorregidaId] - ID de la revisión corregida (para enmiendas)
 * @param {boolean} [metadatos.aplicaAlEstadoActual] - Proyección en estado actual
 * @param {Array<object>} deltas - Arreglo de deltas calculados
 * @param {object} [opciones]
 * @param {boolean} [opciones.soporteSnapshotHistorico=false] - Si existe capacidad de edición histórica (7F-4)
 * @returns {{ esValido: boolean, errores: Record<string, string>, advertencias: string[] }}
 */
export function validarMetadatosRevision(
  metadatos = {},
  deltas = [],
  opciones = { soporteSnapshotHistorico: false },
) {
  const errores = {};
  const advertencias = [];

  const {
    tipoRevision = TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
    motivoRevision = '',
    fechaObservacionClinica = '',
    consultaId = null,
    revisionCorregidaId = null,
  } = metadatos;

  // 1. Validar tipo de revisión
  if (!Object.values(TIPO_REVISION_ODONTOGRAMA).includes(tipoRevision)) {
    errores.tipoRevision = 'El tipo de revisión debe ser NUEVA_OBSERVACION o ENMIENDA_CORRECTIVA.';
  }

  // 2. Regla para ENMIENDA_CORRECTIVA vs NUEVA_OBSERVACION
  if (tipoRevision === TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA) {
    if (!opciones.soporteSnapshotHistorico) {
      errores.tipoRevision =
        'La opción ENMIENDA_CORRECTIVA requiere cargar el snapshot histórico base de la revisión a rectificar (función programada para la Iteración 7F-4). Por seguridad clínica, utilice NUEVA_OBSERVACION.';
    }
    if (!revisionCorregidaId || typeof revisionCorregidaId !== 'string' || !revisionCorregidaId.trim()) {
      errores.revisionCorregidaId =
        'Toda enmienda correctiva debe referenciar obligatoriamente el identificador de la revisión corregida (revisionCorregidaId).';
    }
  } else if (tipoRevision === TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION) {
    if (revisionCorregidaId) {
      errores.revisionCorregidaId =
        'Una nueva observación clínica no debe referenciar una revisión corregida.';
    }
  }

  // 3. Validar motivo de revisión
  const motivoTrim = typeof motivoRevision === 'string' ? motivoRevision.trim() : '';
  if (!motivoTrim) {
    errores.motivoRevision = 'El motivo o justificación clínica de la revisión es obligatorio.';
  } else if (motivoTrim.length > 500) {
    errores.motivoRevision = `El motivo de la revisión no puede exceder 500 caracteres (actual: ${motivoTrim.length}).`;
  }

  // 4. Validar fecha de observación clínica
  if (!fechaObservacionClinica || typeof fechaObservacionClinica !== 'string' || !fechaObservacionClinica.trim()) {
    errores.fechaObservacionClinica = 'La fecha de observación clínica es obligatoria.';
  } else if (!esFechaISO8601Valida(fechaObservacionClinica)) {
    errores.fechaObservacionClinica = 'La fecha de observación clínica debe ser una fecha ISO 8601 válida.';
  }

  // 5. Validar consultaId si viene especificado
  if (consultaId !== null && consultaId !== undefined && typeof consultaId === 'string') {
    const consultaTrim = consultaId.trim();
    if (consultaTrim && !consultaTrim.startsWith('cons_') && consultaTrim.length < 5) {
      advertencias.push('El identificador de consulta no parece seguir el formato canónico cons_...');
    }
  }

  // 6. Validar deltas (no enviar cambios vacíos)
  if (!Array.isArray(deltas) || deltas.length === 0) {
    errores.deltas = 'No existen modificaciones clínicas preparadas en el borrador para registrar.';
  } else {
    // Validar cada delta de manera anatómica
    for (const delta of deltas) {
      if (!delta || !esNumeroFDIValido(delta.numeroFDI)) {
        errores.deltas = `El borrador contiene una pieza dental con número FDI inválido: ${delta?.numeroFDI}.`;
        break;
      }
    }
  }

  return {
    esValido: Object.keys(errores).length === 0,
    errores,
    advertencias,
  };
}

/**
 * Sanitiza y construye de forma pura el objeto DeltaPiezaHttpDto
 * omitiendo campos vacíos o undefined y previniendo inyecciones de identidad.
 *
 * @param {object} delta
 * @returns {object}
 */
export function sanitizarDeltaPieza(delta) {
  if (!delta || typeof delta !== 'object') {
    throw new Error('Delta inválido.');
  }

  const numeroFDI = Number(delta.numeroFDI);
  if (!esNumeroFDIValido(numeroFDI)) {
    throw new Error(`Número FDI no anatómico en delta: ${delta.numeroFDI}`);
  }

  const sanitized = { numeroFDI };

  if (delta.estadoAnatomicoAnterior) {
    sanitized.estadoAnatomicoAnterior = delta.estadoAnatomicoAnterior;
  }
  if (delta.estadoAnatomicoNuevo) {
    sanitized.estadoAnatomicoNuevo = delta.estadoAnatomicoNuevo;
  }

  if (Array.isArray(delta.superficiesModificadas) && delta.superficiesModificadas.length > 0) {
    sanitized.superficiesModificadas = delta.superficiesModificadas.map((s) => ({
      superficie: s.superficie,
      condicionAnterior: s.condicionAnterior,
      condicionNueva: s.condicionNueva,
    }));
  }

  if (delta.tratamientoEstructuralAgregado) {
    sanitized.tratamientoEstructuralAgregado = delta.tratamientoEstructuralAgregado;
  }

  if (delta.observaciones !== undefined && delta.observaciones !== null) {
    const obs = String(delta.observaciones).trim();
    if (obs) {
      sanitized.observaciones = obs.slice(0, 500);
    }
  }

  return sanitized;
}

/**
 * Función PURA que construye el payload final exacto para la llamada REST:
 * POST /odontogramas/:id/revisiones
 *
 * Reglas:
 * - Preserva versionEsperada inmutable a partir de odontogramaActual.version.
 * - No incrementa versiones manualmente en el cliente.
 * - Rechaza deltas vacíos o inconsistentes.
 * - No incluye propiedades desconocidas o no contempladas en RegistrarRevisionOdontogramaHttpDto.
 * - Prohíbe terminantemente odontologoId, pacienteId, historiaClinicaId, numeroRevision.
 *
 * @param {object} parametros
 * @param {object} parametros.odontogramaActual - Odontograma consolidado actual del servidor
 * @param {object} parametros.metadatos - Metadatos de la revisión
 * @param {Array<object>} parametros.deltas - Arreglo de deltas calculados
 * @param {object} [parametros.opciones] - Opciones adicionales de validación
 * @returns {object} RegistrarRevisionOdontogramaHttpDto saneado y congelado
 */
export function construirPayloadRevision({
  odontogramaActual,
  metadatos = {},
  deltas = [],
  opciones = { soporteSnapshotHistorico: false },
}) {
  if (!odontogramaActual || typeof odontogramaActual !== 'object') {
    throw new Error('Se requiere el odontograma actual del servidor para construir el payload.');
  }

  const versionEsperada = Number(odontogramaActual.version);
  if (!Number.isInteger(versionEsperada) || versionEsperada < 1) {
    throw new Error('La versión del odontograma actual debe ser un número entero mayor o igual a 1.');
  }

  // Validar metadatos clínicos
  const validacion = validarMetadatosRevision(metadatos, deltas, opciones);
  if (!validacion.esValido) {
    const primerError = Object.values(validacion.errores)[0];
    throw new Error(`Validación clínica fallida: ${primerError}`);
  }

  const {
    tipoRevision = TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
    motivoRevision,
    fechaObservacionClinica,
    consultaId = null,
    revisionCorregidaId = null,
    aplicaAlEstadoActual = true,
  } = metadatos;

  // Sanitizar deltas garantizando que ninguno viole los contratos
  const deltasSanitizados = deltas.map(sanitizarDeltaPieza);

  // Formatear fecha ISO 8601 estricta
  const fechaISO = new Date(fechaObservacionClinica).toISOString();

  // Construcción estricta del DTO sin propiedades sobrantes ni de identidad clínica
  const payload = {
    versionEsperada,
    tipoRevision,
    fechaObservacionClinica: fechaISO,
    motivoRevision: motivoRevision.trim(),
    deltas: deltasSanitizados,
    aplicaAlEstadoActual: Boolean(aplicaAlEstadoActual),
  };

  // Solo incluir consultaId si tiene un valor no vacío; si es falsy, usar null
  if (consultaId && typeof consultaId === 'string' && consultaId.trim()) {
    payload.consultaId = consultaId.trim();
  } else {
    payload.consultaId = null;
  }

  // Solo incluir revisionCorregidaId si es ENMIENDA_CORRECTIVA
  if (tipoRevision === TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA && revisionCorregidaId) {
    payload.revisionCorregidaId = revisionCorregidaId.trim();
  } else {
    payload.revisionCorregidaId = null;
  }

  return Object.freeze(payload);
}
