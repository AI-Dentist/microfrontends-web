import { parseProblemDetails, ProblemDetailsError } from './problem-details.js';

const BASE_URL = import.meta.env?.VITE_API_BASE_URL || '/api/expediente';

// A capability, not a captured token: each request reads the current session.
export function createHttpClient({ apiBaseUrl = BASE_URL, getAccessToken } = {}) {
  return (endpoint, options = {}) => httpClient(endpoint, {
    ...options,
    apiBaseUrl,
    token: getAccessToken ? getAccessToken() : options.token,
  });
}

/**
 * Cliente HTTP modular para interactuar con la API REST de expediente clínico.
 *
 * @param {string} endpoint - Ruta relativa al BASE_URL (e.g. '/health', '/historias-clinicas/123')
 * @param {object} options
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [options.method='GET']
 * @param {object} [options.body]
 * @param {string} [options.token] - Token Bearer para autenticación
 * @param {HeadersInit} [options.headers]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<any>}
 */
export async function httpClient(endpoint, {
  method = 'GET',
  body,
  token,
  headers = {},
  signal,
  apiBaseUrl = BASE_URL,
} = {}) {
  const baseQueryIndex = apiBaseUrl.indexOf('?');
  const basePath = baseQueryIndex === -1 ? apiBaseUrl : apiBaseUrl.slice(0, baseQueryIndex);
  const baseQuery = baseQueryIndex === -1 ? '' : apiBaseUrl.slice(baseQueryIndex + 1);
  const endpointQueryIndex = endpoint.indexOf('?');
  const endpointPath = endpointQueryIndex === -1 ? endpoint : endpoint.slice(0, endpointQueryIndex);
  const endpointQuery = endpointQueryIndex === -1 ? '' : endpoint.slice(endpointQueryIndex + 1);
  // Append rather than reserialize: preserve encoding, order and repeated keys.
  const query = [baseQuery, endpointQuery].filter(Boolean).join('&');
  const suffix = baseQueryIndex !== -1 || endpointQueryIndex !== -1 ? `?${query}` : '';
  const url = `${basePath.replace(/\/$/, '')}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}${suffix}`;

  const requestHeaders = {
    Accept: 'application/json, application/problem+json',
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    requestHeaders.Authorization = `Bearer ${token.trim()}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    throw new ProblemDetailsError({
      type: 'https://api.odontoclinic.local/errors/connection-failed',
      title: 'Fallo de conexión',
      status: 0,
      detail: 'No fue posible comunicarse con el API Gateway Nginx o el microservicio.',
      instance: url,
    });
  }

  if (!response.ok) {
    const problem = await parseProblemDetails(response);
    throw problem;
  }

  // Si la respuesta no tiene contenido (204)
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}
