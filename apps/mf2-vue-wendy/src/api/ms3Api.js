const DEFAULT_BASE = import.meta.env?.VITE_MS3_API_BASE_URL ||
  'http://localhost:8001/api/agendamiento';

// A factory per app instance: capabilities are consulted at request time only.
export function createMs3Service({ apiBaseUrl = DEFAULT_BASE, getAccessToken = () => null } = {}) {
  const queryIndex = apiBaseUrl.indexOf('?');
  const base = (queryIndex === -1 ? apiBaseUrl : apiBaseUrl.slice(0, queryIndex)).replace(/\/+$/, '');
  // Keep query bytes intact (including repeated keys) after the endpoint path.
  const query = queryIndex === -1 ? '' : apiBaseUrl.slice(queryIndex);
  async function request(path, options = {}) {
    const headers = { ...options.headers };
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${base}/${path}${query}`, { method: 'GET', ...options, headers });
    if (!response.ok) throw new Error(`MS3 request failed (HTTP ${response.status})`);
    return response.json();
  }
  return {
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
