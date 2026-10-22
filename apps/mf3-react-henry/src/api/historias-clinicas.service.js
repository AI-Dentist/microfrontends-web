import { httpClient } from './client.js';

export const historiasClinicasService = {
  /**
   * Consulta el estado de salud del microservicio y de la conexión a MongoDB.
   * Endpoint público de infraestructura.
   */
  async getHealth(signal) {
    return httpClient('/health', { signal });
  },

  /**
   * Obtiene una historia clínica por su identificador canónico.
   *
   * @param {string} id - Identificador de la historia clínica
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   */
  async getById(id, token, signal) {
    if (!id || !id.trim()) {
      throw new Error('El ID de la historia clínica es requerido.');
    }
    return httpClient(`/historias-clinicas/${encodeURIComponent(id.trim())}`, {
      token,
      signal,
    });
  },

  /**
   * Busca la historia clínica asociada a un paciente específico.
   *
   * @param {string} pacienteId - Identificador del paciente en MS1
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<any>} Devuelve la historia clínica encontrada (o null si el array está vacío)
   */
  async getByPacienteId(pacienteId, token, signal) {
    if (!pacienteId || !pacienteId.trim()) {
      throw new Error('El ID del paciente es requerido.');
    }
    const result = await httpClient(
      `/historias-clinicas?pacienteId=${encodeURIComponent(pacienteId.trim())}`,
      { token, signal },
    );
    // El backend devuelve un array [historia]
    if (Array.isArray(result) && result.length > 0) {
      return result[0];
    }
    return result;
  },

  /**
   * Crea una nueva historia clínica en el sistema.
   *
   * @param {object} payload - CrearHistoriaClinicaHttpDto
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   */
  async create(payload, token, signal) {
    return httpClient('/historias-clinicas', {
      method: 'POST',
      body: payload,
      token,
      signal,
    });
  },

  /**
   * Actualiza los antecedentes estructurados de una historia clínica.
   *
   * @param {string} id - Identificador de la historia clínica
   * @param {object} payload - ActualizarAntecedentesHttpDto (versionEsperada, nuevosAntecedentes, camposModificados, descripcion)
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   */
  async updateAntecedentes(id, payload, token, signal) {
    if (!id || !id.trim()) {
      throw new Error('El ID de la historia clínica es requerido.');
    }
    return httpClient(`/historias-clinicas/${encodeURIComponent(id.trim())}/antecedentes`, {
      method: 'PATCH',
      body: payload,
      token,
      signal,
    });
  },

  /**
   * Registra una nueva alergia en el expediente clínico.
   *
   * @param {string} id - Identificador de la historia clínica
   * @param {object} payload - AgregarAlergiaHttpDto (versionEsperada, sustancia, tipoReaccion, severidad, notasAdicionales, descripcion)
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   */
  async agregarAlergia(id, payload, token, signal) {
    if (!id || !id.trim()) {
      throw new Error('El ID de la historia clínica es requerido.');
    }
    return httpClient(`/historias-clinicas/${encodeURIComponent(id.trim())}/alergias`, {
      method: 'POST',
      body: payload,
      token,
      signal,
    });
  },

  /**
   * Elimina una alergia registrada por su sustancia (case-insensitive).
   *
   * @param {string} id - Identificador de la historia clínica
   * @param {string} sustancia - Sustancia alérgena a eliminar
   * @param {object} payload - EliminarAlergiaHttpDto (versionEsperada, descripcion)
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   */
  async eliminarAlergia(id, sustancia, payload, token, signal) {
    if (!id || !id.trim()) {
      throw new Error('El ID de la historia clínica es requerido.');
    }
    if (!sustancia || !sustancia.trim()) {
      throw new Error('La sustancia de la alergia es requerida.');
    }
    return httpClient(
      `/historias-clinicas/${encodeURIComponent(id.trim())}/alergias/${encodeURIComponent(sustancia.trim())}`,
      {
        method: 'DELETE',
        body: payload,
        token,
        signal,
      },
    );
  },

  /**
   * Reemplaza el listado completo de medicamentos actuales del paciente.
   *
   * @param {string} id - Identificador de la historia clínica
   * @param {object} payload - ActualizarMedicamentosHttpDto (versionEsperada, medicamentos, descripcion)
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   */
  async actualizarMedicamentos(id, payload, token, signal) {
    if (!id || !id.trim()) {
      throw new Error('El ID de la historia clínica es requerido.');
    }
    return httpClient(`/historias-clinicas/${encodeURIComponent(id.trim())}/medicamentos`, {
      method: 'PUT',
      body: payload,
      token,
      signal,
    });
  },

  /**
   * Solicita una transición en la máquina de estados del expediente clínico.
   *
   * @param {string} id - Identificador de la historia clínica
   * @param {object} payload - CambiarEstadoHistoriaHttpDto (versionEsperada, nuevoEstado, descripcion)
   * @param {string} token - Token de autenticación del operador
   * @param {AbortSignal} [signal]
   */
  async cambiarEstado(id, payload, token, signal) {
    if (!id || !id.trim()) {
      throw new Error('El ID de la historia clínica es requerido.');
    }
    return httpClient(`/historias-clinicas/${encodeURIComponent(id.trim())}/estado`, {
      method: 'PATCH',
      body: payload,
      token,
      signal,
    });
  },
};

