import { parseProblemDetails, ProblemDetailsError } from './problem-details.js';

export function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return '/api/expediente';
  }
  return process.env.API_BASE_URL || 'http://localhost/api/expediente';
}

/**
 * Retorna la URL base para el módulo de odontogramas.
 * Permite redirigir exclusivamente las llamadas de odontograma al puerto aislado (e.g. 3002)
 * cuando esté explícitamente configurado, sin alterar el resto de la aplicación ni la conectividad general.
 */
export function getOdontogramaBaseUrl() {
  if (typeof window !== 'undefined') {
    if (window.__ODONTOGRAMA_TEST_API_URL__) {
      return window.__ODONTOGRAMA_TEST_API_URL__;
    }
    const paramMatch = window.location?.search?.match(/[?&]apiPort=(\d+)/);
    if (paramMatch && paramMatch[1]) {
      return `http://127.0.0.1:${paramMatch[1]}/api/expediente`;
    }
    const stored = window.localStorage?.getItem('ODONTOGRAMA_TEST_API_URL');
    if (stored) {
      return stored;
    }
  }
  return getBaseUrl();
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
 * @param {string} [options.baseUrl] - URL base personalizada opcional
 * @returns {Promise<any>}
 */
export async function httpClient(endpoint, {
  method = 'GET',
  body,
  token,
  headers = {},
  signal,
  baseUrl,
} = {}) {
  const base = baseUrl || getBaseUrl();
  const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

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
