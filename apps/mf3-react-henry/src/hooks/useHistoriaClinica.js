import { useState, useCallback, useRef, useEffect } from 'react';
import { useClinicalServices } from '../context/ClinicalServices.jsx';
import { useDevAuth } from './useDevAuth.js';

export function useHistoriaClinica() {
  const { token } = useDevAuth();
  const historiasClinicasService = useClinicalServices();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [criterioBusqueda, setCriterioBusqueda] = useState(null);

  const abortControllerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const limpiar = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setData(null);
    setError(null);
    setLoading(false);
    setCriterioBusqueda(null);
  }, []);

  const buscarPorId = useCallback(
    async (id) => {
      if (!id || !id.trim()) {
        setError({
          title: 'Parámetro requerido',
          detail: 'Ingrese un identificador de historia clínica para buscar.',
        });
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);
      setData(null);
      setCriterioBusqueda({ tipo: 'ID', valor: id.trim() });

      try {
        const result = await historiasClinicasService.getById(
          id.trim(),
          token,
          abortControllerRef.current.signal,
        );
        setData(result);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    },
    [token, historiasClinicasService],
  );

  const buscarPorPaciente = useCallback(
    async (pacienteId) => {
      if (!pacienteId || !pacienteId.trim()) {
        setError({
          title: 'Parámetro requerido',
          detail: 'Ingrese un identificador de paciente para buscar.',
        });
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);
      setData(null);
      setCriterioBusqueda({ tipo: 'PACIENTE', valor: pacienteId.trim() });

      try {
        const result = await historiasClinicasService.getByPacienteId(
          pacienteId.trim(),
          token,
          abortControllerRef.current.signal,
        );
        setData(result);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    },
    [token, historiasClinicasService],
  );

  return {
    data,
    loading,
    error,
    criterioBusqueda,
    buscarPorId,
    buscarPorPaciente,
    limpiar,
  };
}
