import { httpClient, getOdontogramaBaseUrl } from './client.js';
import {
  TIPO_REVISION_ODONTOGRAMA,
  esNumeroFDIValido,
} from '../constants/odontograma.constants.js';

/**
 * Servicio API para interactuar con los endpoints del Odontograma Longitudinal en MS2.
 * Ruta base resuelta a través de Nginx: /api/expediente/odontogramas
 */
export const odontogramasService = {
  /**
   * 1. Inicializa el agregado longitudinal del odontograma para una historia clínica activa
   * con sus 52 posiciones FDI en estado basal (DESCONOCIDO / NO_EVALUADO).
   *
   * @param {string} historiaClinicaId - Identificador canónico de la historia clínica
   * @param {string} token - Token de autenticación Bearer del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>} OdontogramaActualDto (201 Created)
   */
  async inicializarOdontograma(historiaClinicaId, token, signal) {
    if (!historiaClinicaId || typeof historiaClinicaId !== 'string' || !historiaClinicaId.trim()) {
      throw new Error('El ID de la historia clínica es obligatorio para inicializar el odontograma.');
    }

    // Regla de seguridad: no enviar pacienteId ni odontologoId en el payload
    const body = {
      historiaClinicaId: historiaClinicaId.trim(),
    };

    return httpClient('/odontogramas/inicializar', {
      method: 'POST',
      body,
      token,
      signal,
      baseUrl: getOdontogramaBaseUrl(),
    });
  },

  /**
   * 2. Obtiene el odontograma actual consolidado de una historia clínica.
   *
   * @param {string} historiaClinicaId - Identificador canónico de la historia clínica
   * @param {string} token - Token de autenticación Bearer del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>} OdontogramaActualDto (200 OK)
   */
  async obtenerOdontogramaActual(historiaClinicaId, token, signal) {
    if (!historiaClinicaId || typeof historiaClinicaId !== 'string' || !historiaClinicaId.trim()) {
      throw new Error('El ID de la historia clínica es obligatorio para obtener el odontograma actual.');
    }

    return httpClient(`/odontogramas/historia/${encodeURIComponent(historiaClinicaId.trim())}`, {
      method: 'GET',
      token,
      signal,
      baseUrl: getOdontogramaBaseUrl(),
    });
  },

  /**
   * 3. Registra una nueva revisión o enmienda correctiva inmutable con control de concurrencia optimista.
   *
   * @param {string} odontogramaId - Identificador canónico del odontograma (odo_...)
   * @param {object} payload - RegistrarRevisionOdontogramaHttpDto
   * @param {number} payload.versionEsperada - Versión entera positiva >= 1
   * @param {string} payload.tipoRevision - 'NUEVA_OBSERVACION' | 'ENMIENDA_CORRECTIVA'
   * @param {string|null} [payload.consultaId] - Identificador de la consulta en curso
   * @param {string} payload.fechaObservacionClinica - Fecha ISO 8601
   * @param {string} payload.motivoRevision - Justificación clínica (hasta 500 caracteres)
   * @param {Array<object>} payload.deltas - Cambios atómicos aplicados a piezas dentales
   * @param {string|null} [payload.revisionCorregidaId] - ID de revisión a enmendar
   * @param {boolean} payload.aplicaAlEstadoActual - Si proyecta al estado maestro consolidado
   * @param {string} token - Token de autenticación Bearer del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>} RevisionOdontogramaDto (201 Created)
   */
  async registrarRevisionOdontograma(odontogramaId, payload, token, signal) {
    if (!odontogramaId || typeof odontogramaId !== 'string' || !odontogramaId.trim()) {
      throw new Error('El ID del odontograma es obligatorio para registrar una revisión.');
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('El payload de la revisión es obligatorio.');
    }

    const { versionEsperada, tipoRevision, fechaObservacionClinica, motivoRevision, deltas } = payload;

    if (!Number.isInteger(versionEsperada) || versionEsperada < 1) {
      throw new Error('La versionEsperada debe ser un número entero mayor o igual a 1.');
    }

    if (!Object.values(TIPO_REVISION_ODONTOGRAMA).includes(tipoRevision)) {
      throw new Error('El tipo de revisión debe ser NUEVA_OBSERVACION o ENMIENDA_CORRECTIVA.');
    }

    if (!fechaObservacionClinica || typeof fechaObservacionClinica !== 'string') {
      throw new Error('La fecha de observación clínica es obligatoria y debe ser formato ISO 8601.');
    }

    if (!motivoRevision || typeof motivoRevision !== 'string' || !motivoRevision.trim()) {
      throw new Error('El motivo de la revisión es obligatorio.');
    }

    if (!Array.isArray(deltas)) {
      throw new Error('El conjunto de deltas debe ser un arreglo.');
    }

    // Validación básica de números FDI en los deltas si están presentes
    for (const delta of deltas) {
      if (delta && delta.numeroFDI !== undefined && !esNumeroFDIValido(delta.numeroFDI)) {
        throw new Error(
          `Delta contiene un número FDI no anatómico: ${delta.numeroFDI}. Debe pertenecer a las 52 posiciones válidas.`,
        );
      }
    }

    // Regla de seguridad estricta: Sanear el payload para NO aceptar ni enviar odontologoId ni pacienteId
    const safePayload = {
      versionEsperada,
      tipoRevision,
      consultaId: payload.consultaId || null,
      fechaObservacionClinica,
      motivoRevision: motivoRevision.trim(),
      deltas,
      revisionCorregidaId: payload.revisionCorregidaId || null,
      aplicaAlEstadoActual: payload.aplicaAlEstadoActual ?? true,
    };

    return httpClient(`/odontogramas/${encodeURIComponent(odontogramaId.trim())}/revisiones`, {
      method: 'POST',
      body: safePayload,
      token,
      signal,
      baseUrl: getOdontogramaBaseUrl(),
    });
  },

  /**
   * 4. Consulta el historial paginado de revisiones inmutables de un odontograma.
   *
   * @param {string} odontogramaId - Identificador canónico del odontograma
   * @param {object} [pagination]
   * @param {number} [pagination.limite=20] - Máximo de revisiones a recuperar (1..100)
   * @param {number} [pagination.offset=0] - Desplazamiento
   * @param {string} token - Token de autenticación Bearer del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ total: number, limite: number, offset: number, revisiones: Array }>}
   */
  async listarHistorialOdontograma(odontogramaId, { limite = 20, offset = 0 } = {}, token, signal) {
    if (!odontogramaId || typeof odontogramaId !== 'string' || !odontogramaId.trim()) {
      throw new Error('El ID del odontograma es obligatorio para consultar su historial.');
    }

    const params = new URLSearchParams();
    if (limite !== undefined && limite !== null) {
      params.set('limite', String(limite));
    }
    if (offset !== undefined && offset !== null) {
      params.set('offset', String(offset));
    }

    const query = params.toString() ? `?${params.toString()}` : '';
    const endpoint = `/odontogramas/${encodeURIComponent(odontogramaId.trim())}/historial${query}`;

    return httpClient(endpoint, {
      method: 'GET',
      token,
      signal,
      baseUrl: getOdontogramaBaseUrl(),
    });
  },

  /**
   * 5. Recupera el snapshot histórico inmutable de las 52 piezas dentales en una revisión específica.
   *
   * @param {string} odontogramaId - Identificador canónico del odontograma
   * @param {string} revisionId - Identificador canónico de la revisión (rev_...)
   * @param {string} token - Token de autenticación Bearer del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>} RevisionOdontogramaDto con snapshotPiezas (200 OK)
   */
  async obtenerSnapshotRevision(odontogramaId, revisionId, token, signal) {
    if (!odontogramaId || typeof odontogramaId !== 'string' || !odontogramaId.trim()) {
      throw new Error('El ID del odontograma es obligatorio.');
    }
    if (!revisionId || typeof revisionId !== 'string' || !revisionId.trim()) {
      throw new Error('El ID de la revisión es obligatorio.');
    }

    const endpoint = `/odontogramas/${encodeURIComponent(odontogramaId.trim())}/revisiones/${encodeURIComponent(revisionId.trim())}`;

    return httpClient(endpoint, {
      method: 'GET',
      token,
      signal,
      baseUrl: getOdontogramaBaseUrl(),
    });
  },

  /**
   * 6. Retorna todas las revisiones y snapshots históricos realizados en el marco de una consulta odontológica.
   *
   * @param {string} consultaId - Identificador canónico de la consulta (cons_...)
   * @param {string} token - Token de autenticación Bearer del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<Array<object>>} RevisionOdontogramaDto[] (200 OK)
   */
  async obtenerSnapshotsPorConsulta(consultaId, token, signal) {
    if (!consultaId || typeof consultaId !== 'string' || !consultaId.trim()) {
      throw new Error('El ID de la consulta odontológica es obligatorio.');
    }

    return httpClient(`/odontogramas/consulta/${encodeURIComponent(consultaId.trim())}`, {
      method: 'GET',
      token,
      signal,
      baseUrl: getOdontogramaBaseUrl(),
    });
  },

  /**
   * 7. Consulta el estado de aislamiento de base de datos y capacidad de escritura transaccional.
   *
   * @param {string} token - Token de autenticación Bearer del operador
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>} { aislado: boolean, entorno: string, puertoMongo: number, replicaSet: string, escrituraHabilitada: boolean }
   */
  async consultarEstadoEntornoAislado(token, signal) {
    return httpClient('/odontogramas/entorno-aislado/status', {
      method: 'GET',
      token,
      signal,
      baseUrl: getOdontogramaBaseUrl(),
    });
  },
};
