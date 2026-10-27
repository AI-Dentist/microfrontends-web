import { createContext, useContext } from 'react';
import { historiasClinicasService } from '../api/historias-clinicas.service.js';

export const ClinicalServicesContext = createContext(historiasClinicasService);
export function useClinicalServices() {
  return useContext(ClinicalServicesContext);
}
