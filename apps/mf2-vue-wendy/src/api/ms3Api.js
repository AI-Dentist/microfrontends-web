const DEFAULT_BASE = import.meta.env?.VITE_MS3_API_BASE_URL ||
  'http://localhost:8001/api/agendamiento';

export class Ms3CapabilityError extends Error {
  constructor(message = 'MS3 host capability unavailable') {
    super(message);
    this.name = 'Ms3CapabilityError';
  }
}

// A factory per app instance: capabilities are consulted at request time only.
// Hosted instances fail closed: no default base, no anonymous request, and a
// revoked or retired capability never revives for the same instance.
export function createMs3Service({ apiBaseUrl, getAccessToken, hosted = false } = {}) {
  if (hosted && (typeof apiBaseUrl !== 'string' || !apiBaseUrl ||
      typeof getAccessToken !== 'function')) throw new Ms3CapabilityError();
  if (!hosted) {
    apiBaseUrl ??= DEFAULT_BASE;
    getAccessToken ??= () => null;
  }
  let retired = false;
  function retire() { if (hosted) retired = true; }
  function hostToken() {
    if (retired) throw new Ms3CapabilityError();
    let token;
    try { token = getAccessToken(); } catch { token = null; }
    if (typeof token !== 'string' || !token) {
      retire();
      throw new Ms3CapabilityError();
    }
    return token;
  }
  const queryIndex = apiBaseUrl.indexOf('?');
  const base = (queryIndex === -1 ? apiBaseUrl : apiBaseUrl.slice(0, queryIndex)).replace(/\/+$/, '');
  // Keep query bytes intact (including repeated keys) after the endpoint path.
  const query = queryIndex === -1 ? '' : apiBaseUrl.slice(queryIndex);
  async function request(path, options = {}) {
    const headers = { ...options.headers };
    const token = hosted ? hostToken() : getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${base}/${path}${query}`, { method: 'GET', ...options, headers });
    // Results that arrive after retirement must not reach the UI.
    if (retired) throw new Ms3CapabilityError();
    if (!response.ok) throw new Error(`MS3 request failed (HTTP ${response.status})`);
    const body = await response.json();
    if (retired) throw new Ms3CapabilityError();
    return body;
  }
  return {
    get retired() { return retired; },
    retire,
    getCitas: () => request('citas'),
    getHorarios: () => request('horarios'),
    getStock: () => request('stock'),
    crearCita(datosCita) {
      const idempotencyKey = 'key-' + Date.now();
      return request('citas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(datosCita),
      });
    },
  };
}

// Preserve the original standalone import; remote instances use the factory.
export const ms3Service = createMs3Service();
