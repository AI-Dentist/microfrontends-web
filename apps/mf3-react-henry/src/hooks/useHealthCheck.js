import { useState, useEffect, useCallback } from 'react';
import { useClinicalServices } from '../context/ClinicalServices.jsx';

export function useHealthCheck(autoCheck = true) {
  const historiasClinicasService = useClinicalServices();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await historiasClinicasService.getHealth();
      setHealth(data);
      setLastChecked(new Date());
    } catch (err) {
      setError(err);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [historiasClinicasService]);

  useEffect(() => {
    if (!autoCheck) return;

    let isMounted = true;
    const execute = async () => {
      try {
        const data = await historiasClinicasService.getHealth();
        if (isMounted) {
          setHealth(data);
          setLastChecked(new Date());
        }
      } catch (err) {
        if (isMounted) {
          setError(err);
          setHealth(null);
        }
      }
    };

    void execute();

    return () => {
      isMounted = false;
    };
  }, [autoCheck, historiasClinicasService]);

  return {
    health,
    loading,
    error,
    lastChecked,
    checkHealth,
  };
}
