import { httpClient } from './client.js';

export function createHistoriasClinicasService(client = httpClient) {
  return {
  /**
   * Consulta el estado de salud del microservicio y de la conexión a MongoDB.
   * Endpoint público de infraestructura.
   */
  async getHealth(signal) {
    return client('/health', { signal });
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
    return client(`/historias-clinicas/${encodeURIComponent(id.trim())}`, {
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
    const result = await client(
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
    return client('/historias-clinicas', {
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
    return client(`/historias-clinicas/${encodeURIComponent(id.trim())}/antecedentes`, {
      method: 'PATCH',
      body: payload,
      token,
      signal,
    });
  },
  };
}

export const historiasClinicasService = createHistoriasClinicasService();

