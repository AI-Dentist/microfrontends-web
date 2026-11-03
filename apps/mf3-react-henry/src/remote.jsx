import { createRoot } from 'react-dom/client';
import { AppContent } from './App.jsx';
import { DevAuthContext } from './context/dev-auth-context-def.js';
import { ClinicalServicesContext } from './context/ClinicalServices.jsx';
import { mountRemote } from './remote-session.js';
import './index.css';

export const contractVersion = 1;

function RemoteApp({ context }) {
  const services = context.clinicalServices;
  return (
    <div id="root">
      <DevAuthContext.Provider value={{ isDev: false, isRemote: true, currentIdentity: { nombre: 'Sesión del host' } }}>
        <ClinicalServicesContext.Provider value={services}>
          <AppContent remoteContext={context} />
        </ClinicalServicesContext.Provider>
      </DevAuthContext.Provider>
    </div>
  );
}

export function mount(container, context) {
  return mountRemote(container, context, (target) => {
    const root = createRoot(target);
    return {
      render: (nextContext) => root.render(<RemoteApp key={nextContext.sessionKey} context={nextContext} />),
      unmount: () => root.unmount(),
    };
  });
}
