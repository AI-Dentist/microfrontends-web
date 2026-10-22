import { useState, useMemo } from 'react';
import { DEV_IDENTITIES } from '../hooks/dev-identities.js';
import { DevAuthContext } from './dev-auth-context-def.js';

export function DevAuthProvider({ children }) {
  // Mantener el token únicamente en memoria de la sesión activa
  const [selectedToken, setSelectedToken] = useState(() => {
    return import.meta.env.DEV ? 'token_dev_henry' : '';
  });

  const isDev = Boolean(import.meta.env.DEV);

  const currentIdentity = useMemo(() => {
    return (
      DEV_IDENTITIES.find((id) => id.token === selectedToken) || {
        token: selectedToken,
        nombre: 'Personalizado',
        rol: 'Operador Manual',
        valido: true,
      }
    );
  }, [selectedToken]);

  const value = useMemo(
    () => ({
      isDev,
      token: selectedToken,
      currentIdentity,
      setToken: setSelectedToken,
      identities: DEV_IDENTITIES,
    }),
    [isDev, selectedToken, currentIdentity],
  );

  return (
    <DevAuthContext.Provider value={value}>{children}</DevAuthContext.Provider>
  );
}
