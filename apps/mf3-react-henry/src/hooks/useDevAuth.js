import { useContext } from 'react';
import { DevAuthContext } from '../context/dev-auth-context-def.js';

export function useDevAuth() {
  const context = useContext(DevAuthContext);
  if (!context) {
    throw new Error('useDevAuth debe utilizarse dentro de un DevAuthProvider');
  }
  return context;
}
