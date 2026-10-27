import { httpClient } from './client.js';

/**
 * Servicio API para interactuar con los endpoints del módulo de Estudios Clínicos e Imagenología en MS2.
 * Rutas base resueltas a través de Nginx:
 * - /api/expediente/laboratorios
 * - /api/expediente/tipos-estudios
 * - /api/expediente/estudios/solicitudes
 */
export const estudiosService = {
  // ==========================================
  // A. Catálogo de Laboratorios
  // ==========================================

  /**
   * Obtiene la lista de laboratorios.
   * @param {object} [filtros]
   * @param {boolean} [filtros.soloActivos]
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async listarLaboratorios({ soloActivos } = {}, token, signal) {
    const params = new URLSearchParams();
    if (soloActivos !== undefined && soloActivos !== null) {
      params.set('soloActivos', String(soloActivos));
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return httpClient(`/laboratorios${query}`, { method: 'GET', token, signal });
  },

  /**
   * Obtiene un laboratorio por su ID.
   * @param {string} id
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async getLaboratorioById(id, token, signal) {
    return httpClient(`/laboratorios/${encodeURIComponent(id.trim())}`, { method: 'GET', token, signal });
  },

  /**
   * Registra un nuevo laboratorio.
   * @param {object} payload
   * @param {string} payload.nombre
   * @param {string} [payload.descripcion]
   * @param {string} [payload.contacto]
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async crearLaboratorio(payload, token, signal) {
    return httpClient('/laboratorios', { method: 'POST', body: payload, token, signal });
  },

  /**
   * Actualiza los datos de un laboratorio existente.
   * @param {string} id
   * @param {object} payload
   * @param {string} payload.nombre
   * @param {string} [payload.descripcion]
   * @param {string} [payload.contacto]
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async actualizarLaboratorio(id, payload, token, signal) {
    return httpClient(`/laboratorios/${encodeURIComponent(id.trim())}`, { method: 'PUT', body: payload, token, signal });
  },

  /**
   * Activa o desactiva un laboratorio.
   * @param {string} id
   * @param {'ACTIVO'|'INACTIVO'} estado
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async cambiarEstadoLaboratorio(id, estado, token, signal) {
    return httpClient(`/laboratorios/${encodeURIComponent(id.trim())}/estado`, {
      method: 'PATCH',
      body: { estado },
      token,
      signal,
    });
  },

  // ==========================================
  // B. Catálogo de Tipos de Estudio
  // ==========================================

  /**
   * Obtiene la lista de tipos de estudio.
   * @param {object} [filtros]
   * @param {'LABORATORIO'|'IMAGENOLOGIA'} [filtros.categoria]
   * @param {boolean} [filtros.soloActivos]
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async listarTiposEstudio({ categoria, soloActivos } = {}, token, signal) {
    const params = new URLSearchParams();
    if (categoria) {
      params.set('categoria', categoria);
    }
    if (soloActivos !== undefined && soloActivos !== null) {
      params.set('soloActivos', String(soloActivos));
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return httpClient(`/tipos-estudios${query}`, { method: 'GET', token, signal });
  },

  /**
   * Obtiene un tipo de estudio por su ID.
   * @param {string} id
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async getTipoEstudioById(id, token, signal) {
    return httpClient(`/tipos-estudios/${encodeURIComponent(id.trim())}`, { method: 'GET', token, signal });
  },

  /**
   * Crea un nuevo tipo de estudio.
   * @param {object} payload
   * @param {string} payload.codigo
   * @param {string} payload.nombre
   * @param {'LABORATORIO'|'IMAGENOLOGIA'} payload.categoria
   * @param {string} [payload.descripcion]
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async crearTipoEstudio(payload, token, signal) {
    return httpClient('/tipos-estudios', { method: 'POST', body: payload, token, signal });
  },

  /**
   * Actualiza el nombre y/o descripción de un tipo de estudio.
   * @param {string} id
   * @param {object} payload
   * @param {string} payload.nombre
   * @param {string} [payload.descripcion]
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async actualizarTipoEstudio(id, payload, token, signal) {
    return httpClient(`/tipos-estudios/${encodeURIComponent(id.trim())}`, { method: 'PUT', body: payload, token, signal });
  },

  /**
   * Activa o desactiva un tipo de estudio.
   * @param {string} id
   * @param {'ACTIVO'|'INACTIVO'} estado
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async cambiarEstadoTipoEstudio(id, estado, token, signal) {
    return httpClient(`/tipos-estudios/${encodeURIComponent(id.trim())}/estado`, {
      method: 'PATCH',
      body: { estado },
      token,
      signal,
    });
  },

  // ==========================================
  // C. Solicitudes de Estudios
  // ==========================================

  /**
   * Registra una nueva solicitud de estudio asociada a una consulta odontológica activa.
   * @param {object} payload
   * @param {string} payload.consultaId
   * @param {string} payload.tipoEstudioId
   * @param {string} payload.motivo
   * @param {'RUTINA'|'URGENTE'} [payload.prioridad]
   * @param {string} [payload.indicaciones]
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async crearSolicitud(payload, token, signal) {
    return httpClient('/estudios/solicitudes', { method: 'POST', body: payload, token, signal });
  },

  /**
   * Obtiene el detalle de una solicitud de estudio por su ID.
   * @param {string} id
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async getSolicitudById(id, token, signal) {
    return httpClient(`/estudios/solicitudes/${encodeURIComponent(id.trim())}`, { method: 'GET', token, signal });
  },

  /**
   * Obtiene las solicitudes de estudio asociadas a una consulta específica.
   * @param {string} consultaId
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async listarSolicitudesPorConsulta(consultaId, token, signal) {
    return httpClient(`/estudios/solicitudes/consulta/${encodeURIComponent(consultaId.trim())}`, {
      method: 'GET',
      token,
      signal,
    });
  },

  /**
   * Obtiene el historial clínico de solicitudes de estudio de un paciente a través de su historia clínica.
   * @param {string} historiaClinicaId
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async listarSolicitudesPorHistoria(historiaClinicaId, token, signal) {
    return httpClient(`/estudios/solicitudes/historia/${encodeURIComponent(historiaClinicaId.trim())}`, {
      method: 'GET',
      token,
      signal,
    });
  },

  /**
   * Cambia el estado de una solicitud de estudio (SOLICITADO, EN_PROCESO, COMPLETADO, CANCELADO).
   * @param {string} id
   * @param {object} payload
   * @param {'SOLICITADO'|'EN_PROCESO'|'COMPLETADO'|'CANCELADO'} payload.nuevoEstado
   * @param {string} [payload.observaciones]
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async cambiarEstadoSolicitud(id, payload, token, signal) {
    return httpClient(`/estudios/solicitudes/${encodeURIComponent(id.trim())}/estado`, {
      method: 'PATCH',
      body: payload,
      token,
      signal,
    });
  },

  // ==========================================
  // D. Registro de Resultados Clínicos
  // ==========================================

  /**
   * Registra los resultados de un estudio clínico solicitado.
   * @param {string} id - ID de la solicitud
   * @param {object} payload
   * @param {string} payload.resumen
   * @param {string} [payload.observaciones]
   * @param {string} [payload.laboratorioId]
   * @param {string} [payload.fechaResultado]
   * @param {string} token
   * @param {AbortSignal} [signal]
   */
  async registrarResultado(id, payload, token, signal) {
    return httpClient(`/estudios/solicitudes/${encodeURIComponent(id.trim())}/resultado`, {
      method: 'POST',
      body: payload,
      token,
      signal,
    });
  },
};
