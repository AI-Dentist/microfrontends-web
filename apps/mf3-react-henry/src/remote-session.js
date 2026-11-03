import { createHttpClient } from './api/client.js';
import { createHistoriasClinicasService } from './api/historias-clinicas.service.js';
import { createConsultasOdontologicasService } from './api/consultas-odontologicas.service.js';
import { createOdontogramasService } from './api/odontogramas.service.js';
import { createEstudiosService } from './api/estudios.service.js';

export function createClinicalServices(client) {
  return {
    historiasClinicasService: createHistoriasClinicasService(client),
    consultasOdontologicasService: createConsultasOdontologicasService(client),
    odontogramasService: createOdontogramasService(client),
    estudiosService: createEstudiosService(client),
    isActive: client.isActive || (() => true),
  };
}

let nextSessionKey = 0;
function createSession(context) {
  const client = createHttpClient({ ...context, hosted: true });
  let current = context;
  const sessionKey = ++nextSessionKey;
  const services = createClinicalServices(client);
  return {
    retire: client.retire,
    getAccessToken: context.getAccessToken,
    apiBaseUrl: context.apiBaseUrl,
    value(next) {
      current = next;
      return {
        ...next,
        sessionKey,
        clinicalServices: services,
        getAccessToken: client.getAccessToken,
        onNavigate: path => { if (client.isActive()) current.onNavigate(path); },
      };
    },
  };
}

const tabs = [
  'consulta',
  'crear',
  'actualizar',
  'conectividad',
  'gestion',
  'consultas',
  'abrir-consulta',
  'atencion-consulta',
  'detalle-consulta',
  'odontograma',
  'estudios',
];

export function tabFromContext(context) {
  if (context.contractVersion !== 1) throw new Error('Unsupported contract version');
  const { basePath, path } = context;
  if (typeof basePath !== 'string' || !/^\/[a-z0-9-]+$/i.test(basePath)) throw new Error('Invalid basePath');
  if (typeof path !== 'string' || /[\\#\s]|%2e|%2f|%5c/i.test(path) || !path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid path');
  const pathname = new URL(path, 'https://remote.invalid').pathname;
  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) throw new Error('Invalid path outside basePath');
  const tab = pathname.slice(basePath.length + 1);
  return tabs.includes(tab) ? tab : 'consulta';
}

export function navigateTab(context, tab) {
  tabFromContext(context);
  if (!tabs.includes(tab)) throw new Error('Invalid tab');
  context.onNavigate(`${context.basePath}/${tab}`);
}

// Renderer injection keeps lifecycle semantics testable without a browser/global DOM.
export function mountRemote(container, context, createRenderer) {
  tabFromContext(context);
  const basePath = context.basePath;
  const renderer = createRenderer(container);
  let disposed = false;
  let session = createSession(context);
  try { renderer.render(session.value(context)); } catch (error) {
    session.retire(); renderer.unmount(); throw error;
  }
  return {
    update(nextContext) {
      if (disposed) return;
      if (nextContext.basePath !== basePath) throw new Error('Cannot change basePath');
      tabFromContext(nextContext);
      if (nextContext.apiBaseUrl !== session.apiBaseUrl || nextContext.getAccessToken !== session.getAccessToken) {
        session.retire();
        session = createSession(nextContext);
      }
      renderer.render(session.value(nextContext));
    },
    unmount() {
      if (disposed) return;
      disposed = true;
      session.retire();
      renderer.unmount();
    },
  };
}
