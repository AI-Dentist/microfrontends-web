import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { historiasClinicasService } from '../api/historias-clinicas.service.js';
import { consultasOdontologicasService } from '../api/consultas-odontologicas.service.js';
import { odontogramasService } from '../api/odontogramas.service.js';
import { estudiosService } from '../api/estudios.service.js';
import { createAgendaService } from '../api/agenda.service.js';

// Absence of a provider is the existing standalone entry, never the remote.
const standalone = {
  historiasClinicasService, consultasOdontologicasService, odontogramasService, estudiosService,
  agendaService: createAgendaService(),
  isActive: () => true,
};
export const ClinicalServicesContext = createContext(standalone);
export function useClinicalServices(name = 'historiasClinicasService') {
  const services = useContext(ClinicalServicesContext);
  if (!services || !services[name]) throw new Error('Clinical services provider is required');
  return services[name];
}

export function useClinicalActivity() {
  const services = useContext(ClinicalServicesContext);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return useCallback(() => mounted.current && services.isActive(), [services]);
}

// Late success, error and finally handlers must not write into a retired view.
// Checking inside functional updates also covers React's deferred evaluation.
export function useClinicalState(initial) {
  const [value, setValue] = useState(initial);
  const isActive = useClinicalActivity();
  const setCurrent = useCallback(next => {
    if (!isActive()) return;
    setValue(previous => !isActive() ? previous : typeof next === 'function' ? next(previous) : next);
  }, [isActive]);
  return [value, setCurrent];
}
