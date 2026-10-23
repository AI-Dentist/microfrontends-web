import { useState, useCallback, useRef } from 'react';
import { consultasOdontologicasService } from '../api/consultas-odontologicas.service.js';
import { useDevAuth } from './useDevAuth.js';

/**
 * Hook para gestionar operaciones de Consultas Odontológicas.
 */
export function useConsultasOdontologicas() {
  const { token } = useDevAuth();
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
    [token],
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
    [token],
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
    [token],
  );

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
    abrirConsulta,
    resetError,
    limpiar,
    setSelectedConsulta,
  };
}
