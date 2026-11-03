import { useCallback, useRef } from 'react';
import { useClinicalServices, useClinicalState as useState } from '../context/ClinicalServices.jsx';

/**
 * Appointments (MS3) that MS2 accepts for opening a consulta.
 */
export function useCitasAgenda() {
  const agendaService = useClinicalServices('agendaService');
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const cargar = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const lista = await agendaService.listarCitas(abortRef.current.signal);
      setCitas(lista);
      return lista;
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err);
        setCitas([]);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [agendaService]);

  const resetError = useCallback(() => setError(null), []);

  return { configured: agendaService.configured, citas, loading, error, cargar, resetError };
}
