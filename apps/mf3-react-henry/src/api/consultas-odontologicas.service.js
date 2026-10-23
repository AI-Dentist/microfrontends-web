import { httpClient } from './client.js';

/**
 * Servicio API para interactuar con los endpoints de Consultas Odontológicas en MS2.
 * Ruta base resuelta a través de Nginx: /api/expediente/consultas-odontologicas
 */
export const consultasOdontologicasService = {
  /**
   * Registra la apertura de una nueva consulta odontológica.
   *
   * @param {object} payload - AbrirConsultaHttpDto
   * @param {string} payload.historiaClinicaId - Identificador canónico de la historia clínica (obligatorio)
   * @param {string} payload.pacienteId - Identificador del paciente en MS1 (obligatorio)
   * @param {string} payload.motivoConsulta - Motivo principal de la consulta (obligatorio)
   * @param {string|null} [payload.citaId] - Identificador de cita en MS3 (opcional)
   * @param {string} [payload.fechaAtencion] - Fecha de atención ISO 8601 (opcional)
   * @param {object} [payload.anamnesisActual] - Datos de anamnesis actual (opcional)
   * @param {object} [payload.exploracionFisica] - Hallazgos de exploración física (opcional)
   * @param {Array} [payload.diagnosticos] - Diagnósticos iniciales (opcional)
   * @param {Array} [payload.procedimientosRealizados] - Procedimientos en sillón (opcional)
   * @param {object} [payload.evolucionSOAP] - Notas SOAP (opcional)
   * @param {string|null} [payload.recomendaciones] - Recomendaciones terapéuticas (opcional)
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>} ConsultaOdontologicaResponseDto (201 Created)
   */
  async abrirConsulta(payload, token, signal) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('El payload de apertura de consulta es requerido.');
    }
    if (!payload.historiaClinicaId || !payload.historiaClinicaId.trim()) {
      throw new Error('El ID de la historia clínica es obligatorio.');
    }
    if (!payload.pacienteId || !payload.pacienteId.trim()) {
      throw new Error('El ID del paciente es obligatorio.');
    }
    if (!payload.motivoConsulta || !payload.motivoConsulta.trim()) {
      throw new Error('El motivo de consulta es obligatorio.');
    }

    return httpClient('/consultas-odontologicas', {
      method: 'POST',
      body: payload,
      token,
      signal,
    });
  },

  /**
   * Recupera el listado paginado de consultas asociadas a una historia clínica.
   *
   * @param {string} historiaClinicaId - Identificador canónico de la historia clínica
   * @param {object} [pagination]
   * @param {number} [pagination.limite=10] - Cantidad de registros por página (1..50)
   * @param {number} [pagination.offset=0] - Desplazamiento inicial
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ consultas: Array, total: number, limite: number, offset: number }>}
   */
  async listarPorHistoria(historiaClinicaId, { limite = 10, offset = 0 } = {}, token, signal) {
    if (!historiaClinicaId || !historiaClinicaId.trim()) {
      throw new Error('El ID de la historia clínica es requerido para listar sus consultas.');
    }

    const params = new URLSearchParams();
    if (limite !== undefined && limite !== null) {
      params.set('limite', String(limite));
    }
    if (offset !== undefined && offset !== null) {
      params.set('offset', String(offset));
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const endpoint = `/consultas-odontologicas/historia/${encodeURIComponent(historiaClinicaId.trim())}${queryString}`;

    return httpClient(endpoint, {
      method: 'GET',
      token,
      signal,
    });
  },

  /**
   * Obtiene la ficha clínica completa de una consulta odontológica por su ID.
   *
   * @param {string} id - Identificador canónico de la consulta (cons_...)
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>} ConsultaOdontologicaResponseDto
   */
  async getById(id, token, signal) {
    if (!id || !id.trim()) {
      throw new Error('El ID de la consulta odontológica es requerido.');
    }

    return httpClient(`/consultas-odontologicas/${encodeURIComponent(id.trim())}`, {
      method: 'GET',
      token,
      signal,
    });
  },

  /**
   * Actualiza los datos clínicos de la atención en sillón (Iteración 6F-2).
   *
   * @param {string} id - Identificador de la consulta
   * @param {object} payload - ActualizarAtencionHttpDto
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   */
  async actualizarAtencion(id, payload, token, signal) {
    if (!id || !id.trim()) {
      throw new Error('El ID de la consulta es requerido para actualizar la atención.');
    }

    return httpClient(`/consultas-odontologicas/${encodeURIComponent(id.trim())}/atencion`, {
      method: 'PUT',
      body: payload,
      token,
      signal,
    });
  },

  /**
   * Completa y sella formalmente una consulta odontológica (Iteración 6F-3).
   *
   * @param {string} id - Identificador de la consulta
   * @param {object} payload - CompletarConsultaHttpDto ({ versionEsperada })
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   */
  async completarConsulta(id, payload, token, signal) {
    if (!id || !id.trim()) {
      throw new Error('El ID de la consulta es requerido para completarla.');
    }

    return httpClient(`/consultas-odontologicas/${encodeURIComponent(id.trim())}/completar`, {
      method: 'POST',
      body: payload,
      token,
      signal,
    });
  },

  /**
   * Cancela una consulta odontológica en curso con justificación obligatoria (Iteración 6F-3).
   *
   * @param {string} id - Identificador de la consulta
   * @param {object} payload - CancelarConsultaHttpDto ({ versionEsperada, motivoCancelacion })
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   */
  async cancelarConsulta(id, payload, token, signal) {
    if (!id || !id.trim()) {
      throw new Error('El ID de la consulta es requerido para cancelarla.');
    }

    return httpClient(`/consultas-odontologicas/${encodeURIComponent(id.trim())}/cancelar`, {
      method: 'POST',
      body: payload,
      token,
      signal,
    });
  },
};
