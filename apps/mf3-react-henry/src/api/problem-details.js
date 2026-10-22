/**
 * Clase que encapsula errores con formato RFC 7807 (Problem Details).
 */
export class ProblemDetailsError extends Error {
  constructor({
    type = 'about:blank',
    title = 'Error de comunicación',
    status = 500,
    detail = 'Ocurrió un error al procesar la solicitud.',
    instance = '',
    invalidParams = [],
  } = {}) {
    super(detail);
    this.name = 'ProblemDetailsError';
    this.type = type;
    this.title = title;
    this.status = status;
    this.detail = detail;
    this.instance = instance;
    this.invalidParams = invalidParams;
  }
}

/**
 * Parsea la respuesta del servidor intentando extraer RFC 7807 problem+json.
 *
 * @param {Response} response
 * @returns {Promise<ProblemDetailsError>}
 */
export async function parseProblemDetails(response) {
  const status = response.status;
  let parsed = null;

  try {
    parsed = await response.json();
  } catch {
    // Si no es JSON legible, generar estructura mínima
  }

  if (parsed && typeof parsed === 'object') {
    return new ProblemDetailsError({
      type: parsed.type || 'https://api.odontoclinic.local/errors/http-error',
      title: parsed.title || getDefaultTitleForStatus(status),
      status: parsed.status || status,
      detail: parsed.detail || response.statusText || 'Error inesperado del servidor.',
      instance: parsed.instance || response.url || '',
      invalidParams: Array.isArray(parsed.invalidParams) ? parsed.invalidParams : [],
    });
  }

  return new ProblemDetailsError({
    type: 'https://api.odontoclinic.local/errors/network-error',
    title: getDefaultTitleForStatus(status),
    status,
    detail: response.statusText || `Respuesta inesperada con código HTTP ${status}.`,
    instance: response.url || '',
    invalidParams: [],
  });
}

function getDefaultTitleForStatus(status) {
  switch (status) {
    case 400:
      return 'Solicitud incorrecta';
    case 401:
      return 'Autenticación requerida';
    case 403:
      return 'Acceso denegado';
    case 404:
      return 'Recurso no encontrado';
    case 409:
      return 'Conflicto';
    case 422:
      return 'Entidad no procesable';
    case 500:
      return 'Error interno del servidor';
    default:
      return `Error HTTP ${status}`;
  }
}
