import { useState, useCallback, useRef } from 'react';
import { odontogramasService } from '../api/odontogramas.service.js';
import { useDevAuth } from './useDevAuth.js';

/**
 * Hook para la gestión integral del estado de solicitudes y datos del Odontograma Longitudinal.
 *
 * Principios clínicos y de concurrencia:
 * - Conservación inmutable de versionEsperada recibida del servidor.
 * - Conflicto HTTP 409: no realiza reintentos ni sobrescrituras automáticas.
 * - HTTP 503: informa con claridad que el servicio de escritura clínica no está disponible temporalmente.
 * - HTTP 401: propaga ProblemDetailsError según la estrategia de sesión en vigor.
 * - Preserva estados basales DESCONOCIDO y NO_EVALUADO en el modelo consolidado.
 */
export function useOdontograma() {
  const { token } = useDevAuth();

  // Estados de solicitud
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Estados de datos
  const [odontogramaActual, setOdontogramaActual] = useState(null);
  const [historial, setHistorial] = useState({
    total: 0,
    limite: 20,
    offset: 0,
    revisiones: [],
  });
  const [snapshotSeleccionado, setSnapshotSeleccionado] = useState(null);
  const [revisionesConsulta, setRevisionesConsulta] = useState([]);

  const abortControllerRef = useRef(null);

  const limpiarError = useCallback(() => {
    setError(null);
  }, []);

  const limpiarConflicto = useCallback(() => {
    setConflict(null);
  }, []);

  const limpiarMensaje = useCallback(() => {
    setSuccessMessage(null);
  }, []);

  /**
   * 1. Carga el odontograma actual consolidado de una historia clínica.
   *
   * @param {string} historiaClinicaId
   * @returns {Promise<object|null>}
   */
  const cargarOdontogramaActual = useCallback(
    async (historiaClinicaId) => {
      if (!historiaClinicaId || !historiaClinicaId.trim()) {
        setError({
          title: 'Parámetro requerido',
          detail: 'El ID de la historia clínica es necesario para consultar el odontograma.',
          status: 400,
        });
        return null;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);
      setConflict(null);

      try {
        const data = await odontogramasService.obtenerOdontogramaActual(
          historiaClinicaId,
          token,
          abortControllerRef.current.signal,
        );
        setOdontogramaActual(data);
        return data;
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err);
          setOdontogramaActual(null);
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  /**
   * 2. Inicializa el agregado longitudinal para una historia clínica.
   *
   * @param {string} historiaClinicaId
   * @returns {Promise<object|null>}
   */
  const inicializarOdontograma = useCallback(
    async (historiaClinicaId) => {
      if (!historiaClinicaId || !historiaClinicaId.trim()) {
        setError({
          title: 'Parámetro requerido',
          detail: 'Debe ingresar el ID de la historia clínica para inicializar el odontograma.',
          status: 400,
        });
        return null;
      }

      setIsSubmitting(true);
      setLoading(true);
      setError(null);
      setConflict(null);

      try {
        const data = await odontogramasService.inicializarOdontograma(historiaClinicaId, token);
        setOdontogramaActual(data);
        setSuccessMessage('Odontograma inicializado exitosamente en estado basal.');
        return data;
      } catch (err) {
        setError(err);
        return null;
      } finally {
        setIsSubmitting(false);
        setLoading(false);
      }
    },
    [token],
  );

  /**
   * 3. Registra una nueva revisión o enmienda con control de concurrencia optimista.
   *
   * En caso de conflicto HTTP 409:
   * - NO sobrescribe automáticamente ni altera silenciosamente la versión esperada.
   * - Expone el detalle del conflicto en `conflict` para que el odontólogo decida.
   *
   * En caso de HTTP 503:
   * - Provee un mensaje claro indicando que la escritura clínica no está disponible.
   *
   * @param {string} odontogramaId
   * @param {object} payload
   * @returns {Promise<object|null>}
   */
  const registrarRevision = useCallback(
    async (odontogramaId, payload) => {
      if (isSubmitting) {
        return null; // Prevención de doble clic / envío simultáneo
      }

      setIsSubmitting(true);
      setLoading(true);
      setError(null);
      setConflict(null);
      setSuccessMessage(null);

      try {
        const revisionCreada = await odontogramasService.registrarRevisionOdontograma(
          odontogramaId,
          payload,
          token,
        );

        // Si la revisión aplica al estado actual, actualizar el odontograma en memoria
        if (revisionCreada && revisionCreada.aplicaAlEstadoActual && revisionCreada.snapshotPiezas) {
          setOdontogramaActual((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              version: (prev.version || 0) + 1,
              revisionActualId: revisionCreada.id,
              totalRevisiones: (prev.totalRevisiones || 0) + 1,
              actualizadoEn: revisionCreada.fechaRegistro,
              piezas: revisionCreada.snapshotPiezas,
            };
          });
        }

        // Agregar la nueva revisión al listado si está cargado
        setHistorial((prev) => ({
          ...prev,
          total: (prev.total || 0) + 1,
          revisiones: [revisionCreada, ...prev.revisiones],
        }));

        setSuccessMessage('Revisión clínica registrada exitosamente.');
        return revisionCreada;
      } catch (err) {
        if (err.status === 409) {
          // Conflicto de concurrencia optimista detectado
          setConflict({
            status: 409,
            title: err.title || 'Conflicto de concurrencia optimista',
            detail:
              err.detail ||
              'El odontograma ha sido modificado por otro profesional o proceso clínico concurrente.',
            versionServidor: err.versionServidor,
            rawError: err,
          });
        } else if (err.status === 503) {
          // Servicio temporalmente no disponible (ej. Mongo standalone sin réplicas)
          setError({
            status: 503,
            type: err.type,
            title: err.title || 'Servicio de persistencia no disponible',
            detail:
              err.detail ||
              'La escritura clínica del odontograma no está disponible temporalmente. Intente nuevamente en unos instantes.',
            instance: err.instance,
          });
        } else if (err.status === 0 || err.name === 'TypeError' || (err.message && err.message.toLowerCase().includes('fetch'))) {
          // Fallo de red con resultado incierto: no repetir mutación automáticamente
          setError({
            status: 0,
            title: 'Fallo de red o resultado incierto',
            detail:
              'No se pudo confirmar la respuesta del servidor. No repita la operación a ciegas; compruebe el estado del expediente antes de intentar nuevamente para prevenir duplicados.',
            rawError: err,
          });
        } else {
          setError(err);
        }
        return null;
      } finally {
        setIsSubmitting(false);
        setLoading(false);
      }
    },
    [isSubmitting, token],
  );

  /**
   * 4. Carga el historial paginado de revisiones.
   *
   * @param {string} odontogramaId
   * @param {object} [pagination]
   * @returns {Promise<object|null>}
   */
  const cargarHistorial = useCallback(
    async (odontogramaId, { limite = 20, offset = 0 } = {}) => {
      if (!odontogramaId || !odontogramaId.trim()) return null;

      setLoading(true);
      setError(null);

      try {
        const data = await odontogramasService.listarHistorialOdontograma(
          odontogramaId,
          { limite, offset },
          token,
        );
        setHistorial(data || { total: 0, limite, offset, revisiones: [] });
        return data;
      } catch (err) {
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  /**
   * 5. Carga un snapshot histórico específico para inspección longitudinal.
   *
   * @param {string} odontogramaId
   * @param {string} revisionId
   * @returns {Promise<object|null>}
   */
  const cargarSnapshotRevision = useCallback(
    async (odontogramaId, revisionId) => {
      if (!odontogramaId || !revisionId) return null;

      setLoading(true);
      setError(null);

      try {
        const data = await odontogramasService.obtenerSnapshotRevision(
          odontogramaId,
          revisionId,
          token,
        );
        setSnapshotSeleccionado(data);
        return data;
      } catch (err) {
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  /**
   * 6. Carga las revisiones realizadas en una consulta odontológica específica.
   *
   * @param {string} consultaId
   * @returns {Promise<Array|null>}
   */
  const cargarRevisionesPorConsulta = useCallback(
    async (consultaId) => {
      if (!consultaId || !consultaId.trim()) return null;

      setLoading(true);
      setError(null);

      try {
        const data = await odontogramasService.obtenerSnapshotsPorConsulta(consultaId, token);
        setRevisionesConsulta(Array.isArray(data) ? data : []);
        return data;
      } catch (err) {
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  return {
    // Estados reactivos
    loading,
    isSubmitting,
    error,
    conflict,
    successMessage,
    odontogramaActual,
    historial,
    snapshotSeleccionado,
    revisionesConsulta,
    versionEsperada: odontogramaActual?.version ?? 1,

    // Acciones
    cargarOdontogramaActual,
    inicializarOdontograma,
    registrarRevision,
    cargarHistorial,
    cargarSnapshotRevision,
    cargarRevisionesPorConsulta,
    limpiarError,
    limpiarConflicto,
    limpiarMensaje,
    setOdontogramaActual,
    setSnapshotSeleccionado,
  };
}
