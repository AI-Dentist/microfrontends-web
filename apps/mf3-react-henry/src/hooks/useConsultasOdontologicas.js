import { useCallback, useRef } from 'react';
import { useClinicalServices, useClinicalState as useState } from '../context/ClinicalServices.jsx';
import { useDevAuth } from './useDevAuth.js';

/**
 * Hook para gestionar operaciones de Consultas Odontológicas.
 */
export function useConsultasOdontologicas() {
  const { token } = useDevAuth();
  const consultasOdontologicasService = useClinicalServices('consultasOdontologicasService');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Estado para listados
  const [listData, setListData] = useState({
    consultas: [],
    total: 0,
    limite: 10,
    offset: 0,
  });

  // Estado para consulta individual (detalle)
  const [selectedConsulta, setSelectedConsulta] = useState(null);

  // Billable catalog for completion (read from MS2).
  const [catalogo, setCatalogo] = useState([]);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [catalogoError, setCatalogoError] = useState(null);

  const abortControllerRef = useRef(null);

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Carga el listado de consultas de una historia clínica.
   */
  const listarPorHistoria = useCallback(
    async (historiaClinicaId, { limite = 10, offset = 0 } = {}) => {
      if (!historiaClinicaId || !historiaClinicaId.trim()) {
        setError({
          title: 'Campo requerido',
          detail: 'Debe ingresar el identificador de la historia clínica.',
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

      try {
        const response = await consultasOdontologicasService.listarPorHistoria(
          historiaClinicaId,
          { limite, offset },
          token,
          abortControllerRef.current.signal,
        );
        setListData(response || { consultas: [], total: 0, limite, offset });
        return response;
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err);
          setListData({ consultas: [], total: 0, limite, offset });
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, consultasOdontologicasService],
  );

  /**
   * Obtiene el detalle completo de una consulta odontológica.
   */
  const obtenerPorId = useCallback(
    async (consultaId) => {
      if (!consultaId || !consultaId.trim()) {
        setError({
          title: 'Campo requerido',
          detail: 'Debe ingresar el identificador de la consulta odontológica.',
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

      try {
        const response = await consultasOdontologicasService.getById(
          consultaId,
          token,
          abortControllerRef.current.signal,
        );
        setSelectedConsulta(response);
        return response;
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err);
          setSelectedConsulta(null);
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, consultasOdontologicasService],
  );

  /**
   * Registra la apertura de una nueva consulta odontológica.
   */
  const abrirConsulta = useCallback(
    async (payload) => {
      setLoading(true);
      setError(null);

      try {
        const response = await consultasOdontologicasService.abrirConsulta(
          payload,
          token,
        );
        setSelectedConsulta(response);
        return response;
      } catch (err) {
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, consultasOdontologicasService],
  );

  /**
   * Actualiza los datos clínicos de una consulta odontológica en sillón (Iteración 6F-2).
   */
  const actualizarAtencion = useCallback(
    async (consultaId, payload) => {
      if (!consultaId || !consultaId.trim()) {
        setError({
          title: 'Campo requerido',
          detail: 'El identificador de la consulta es obligatorio para actualizar la atención.',
          status: 400,
        });
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await consultasOdontologicasService.actualizarAtencion(
          consultaId,
          payload,
          token,
        );
        setSelectedConsulta(response);
        return response;
      } catch (err) {
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, consultasOdontologicasService],
  );

  /**
   * Consulta el estado fresco del servidor para una consulta específica
   * sin alterar automáticamente la consulta seleccionada en edición ni su borrador.
   */
  const consultarEstadoServidor = useCallback(
    async (consultaId) => {
      if (!consultaId || !consultaId.trim()) return null;
      try {
        return await consultasOdontologicasService.getById(consultaId, token);
      } catch {
        return null;
      }
    },
    [token, consultasOdontologicasService],
  );

  /**
   * Completa y sella formalmente una consulta odontológica en curso (Iteración 6F-3).
   * Requiere payload con versionEsperada para control de concurrencia optimista.
   */
  const completarConsulta = useCallback(
    async (consultaId, payload) => {
      if (!consultaId || !consultaId.trim()) {
        setError({
          title: 'Campo requerido',
          detail: 'El identificador de la consulta es obligatorio para completarla.',
          status: 400,
        });
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await consultasOdontologicasService.completarConsulta(
          consultaId,
          payload,
          token,
        );
        setSelectedConsulta(response);
        return response;
      } catch (err) {
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, consultasOdontologicasService],
  );

  /**
   * Cancela una consulta odontológica en curso con justificación obligatoria (Iteración 6F-3).
   * Requiere payload con versionEsperada y motivoCancelacion (mínimo 10 caracteres en dominio).
   */
  const cancelarConsulta = useCallback(
    async (consultaId, payload) => {
      if (!consultaId || !consultaId.trim()) {
        setError({
          title: 'Campo requerido',
          detail: 'El identificador de la consulta es obligatorio para cancelarla.',
          status: 400,
        });
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await consultasOdontologicasService.cancelarConsulta(
          consultaId,
          payload,
          token,
        );
        setSelectedConsulta(response);
        return response;
      } catch (err) {
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, consultasOdontologicasService],
  );

  const cargarCatalogoServicios = useCallback(async () => {
    setCatalogoLoading(true);
    setCatalogoError(null);
    try {
      const response = await consultasOdontologicasService.listarCatalogoServicios(token);
      setCatalogo(response);
      return response;
    } catch (err) {
      if (err.name !== 'AbortError') {
        setCatalogoError(err);
        setCatalogo([]);
      }
      return null;
    } finally {
      setCatalogoLoading(false);
    }
  }, [token, consultasOdontologicasService]);

  const limpiar = useCallback(() => {
    setListData({ consultas: [], total: 0, limite: 10, offset: 0 });
    setSelectedConsulta(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    loading,
    error,
    listData,
    selectedConsulta,
    listarPorHistoria,
    obtenerPorId,
    consultarEstadoServidor,
    catalogo,
    catalogoLoading,
    catalogoError,
    cargarCatalogoServicios,
    abrirConsulta,
    actualizarAtencion,
    completarConsulta,
    cancelarConsulta,
    resetError,
    limpiar,
    setSelectedConsulta,
  };
}
