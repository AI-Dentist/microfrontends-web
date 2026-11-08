const DEFAULT_BASE = import.meta.env?.VITE_MS3_API_BASE_URL ||
  '/api/agendamiento';

export class Ms3CapabilityError extends Error {
  constructor(message = 'MS3 host capability unavailable') {
    super(message);
    this.name = 'Ms3CapabilityError';
  }
}

// Error raised for every non-2xx MS3 response. Controllers answer
// { success:false, error, code, errors? }; Laravel's own validate() answers
// { message, errors } with no code, so the code falls back to HTTP_<status>.
export class Ms3ApiError extends Error {
  constructor({ status, code, message, errors }) {
    super(message);
    this.name = 'Ms3ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export function describeError(error) {
  if (!(error instanceof Ms3ApiError)) return error?.message || 'Unexpected error';
  if (error.status === 409) return `Conflict (${error.code}): ${error.message}`;
  if (error.status === 422) {
    const fields = Object.entries(error.errors || {})
      .map(([field, messages]) => `${field}: ${[].concat(messages).join(', ')}`).join('; ');
    return `Validation failed (${error.code}): ${error.message}${fields ? ` — ${fields}` : ''}`;
  }
  return `Request failed (HTTP ${error.status}, ${error.code}): ${error.message}`;
}

// Success bodies are { success, data, ... } and repeat list keys at the top level.
export const envelopeData = body => body?.data ?? body;
export const listFrom = (body, key) => body?.data?.[key] ?? body?.[key] ?? [];

// One key per form intent: the same payload retried reuses it, an edited payload
// or a completed intent (renew) gets a fresh one.
export function createIntent(generate = () => crypto.randomUUID()) {
  let current = null;
  return {
    key(payload) {
      const fingerprint = JSON.stringify(payload);
      if (!current || current.fingerprint !== fingerprint) current = { fingerprint, key: generate() };
      return current.key;
    },
    renew() { current = null; },
  };
}

// UI hint only (the token is not verified here); the backend guard decides.
export function hasRole(token, role) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (payload.realm_access?.roles || []).some(r => String(r).replace(/^ROLE_/, '').toUpperCase() === role);
  } catch { return false; }
}

// <input type="datetime-local"> gives 'YYYY-MM-DDTHH:mm[:ss]'; MS3 stores 'YYYY-MM-DD HH:mm:ss'.
export function toBackendDateTime(value) {
  return value.replace('T', ' ') + (value.length === 16 ? ':00' : '');
}

export const MOVEMENT_TYPES = ['ENTRADA_COMPRA', 'SALIDA_PROCEDIMIENTO', 'AJUSTE'];

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
    if (!response.ok) {
      let body;
      try { body = await response.json(); } catch { body = null; }
      if (retired) throw new Ms3CapabilityError();
      throw new Ms3ApiError({ status: response.status, code: body?.code ?? `HTTP_${response.status}`,
        message: body?.error ?? body?.message ?? `MS3 request failed (HTTP ${response.status})`,
        errors: body?.errors });
    }
    const body = await response.json();
    if (retired) throw new Ms3CapabilityError();
    return body;
  }
  const send = (method, path, payload, headers = {}) => request(path, {
    method,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json', ...headers } }),
  });
  const segment = id => encodeURIComponent(id);
  return {
    get retired() { return retired; },
    retire,
    getClusters: () => request('ml/clusters'),
    predictNoShow: payload => send('POST', 'ml/predict-noshow', payload),
    getCitas: () => request('citas'),
    getHorarios: () => request('horarios'),
    getStock: () => request('stock'),
    crearCita(datosCita, { idempotencyKey = crypto.randomUUID() } = {}) {
      return send('POST', 'citas', datosCita, {
        'X-Idempotency-Key': idempotencyKey,
        'Idempotency-Key': idempotencyKey,
      });
    },
    cancelarCita: id => send('PATCH', `citas/${segment(id)}/cancelar`),
    reprogramarCita: (id, nuevaFechaHora) => send('PUT', `citas/${segment(id)}/reprogramar`,
      { nueva_fecha_hora: nuevaFechaHora }),
    noAsistio: id => send('PATCH', `citas/${segment(id)}/no-asistio`),
    // Stock is consumed only for the insumos listed here; none listed means none consumed.
    completarCita: (id, { insumos, motivo } = {}) => send('PATCH', `citas/${segment(id)}/completar`, {
      ...(insumos?.length ? { insumos } : {}), ...(motivo ? { motivo } : {}) }),
    crearHorario: horario => send('POST', 'horarios', horario),
    registrarMovimiento(movimiento, { idempotencyKey } = {}) {
      const { tipo_movimiento: tipo, cantidad, motivo } = movimiento;
      const message = !MOVEMENT_TYPES.includes(tipo) ? `tipo_movimiento must be one of ${MOVEMENT_TYPES.join(', ')}`
        : !Number.isInteger(cantidad) || cantidad < 1 ? 'cantidad must be an integer of at least 1'
          : !motivo ? 'motivo is required' : null;
      if (message) {
        return Promise.reject(new Ms3ApiError({ status: 422, code: 'INVALID_MOVEMENT', message }));
      }
      if (idempotencyKey != null && typeof idempotencyKey !== 'string') {
        return Promise.reject(new Ms3ApiError({ status: 422, code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'idempotencyKey must be a string' }));
      }
      if (typeof idempotencyKey === 'string' && idempotencyKey !== '' && !idempotencyKey.trim()) {
        return Promise.reject(new Ms3ApiError({ status: 422, code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'idempotencyKey must not be whitespace-only' }));
      }
      return send('POST', 'stock/movimientos', movimiento,
        idempotencyKey == null || idempotencyKey === '' ? {} : { 'Idempotency-Key': idempotencyKey });
    },
  };
}

// Preserve the original standalone import; remote instances use the factory.
export const ms3Service = createMs3Service();
