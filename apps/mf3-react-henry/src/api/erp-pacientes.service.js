import { retiredRequest } from './client.js';
import { ProblemDetailsError, parseProblemDetails } from './problem-details.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = 'id nombres apellidos activo';
const problem = (title, detail, status = 422) => new ProblemDetailsError({ title, detail, status });
export const pacienteInexistente = () => problem('PacienteInexistente', 'El paciente seleccionado no existe o está inactivo.');

// The existing client's public capability owns authentication/retirement. Fetch
// uses the GraphQL base verbatim: the REST client's endpoint join adds a slash.
export function createErpPacientesService(capability = null, baseUrl = null) {
  const configured = Boolean(capability && typeof baseUrl === 'string' && baseUrl.trim());
  const isActive = () => Boolean(capability?.isActive());
  async function query(document, variables, signal) {
    if (!configured) throw problem('Catálogo de pacientes no disponible', 'El host no configuró el servicio de pacientes ERP.', 0);
    const check = () => { if (!isActive() || signal?.aborted) throw retiredRequest(); };
    check();
    const token = capability.getAccessToken();
    if (!token) throw retiredRequest();
    try {
      const response = await fetch(baseUrl, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token.trim()}` },
        body: JSON.stringify({ query: document, variables }),
      });
      check();
      if (!response.ok) {
        const error = await parseProblemDetails(response); check(); throw error;
      }
      const body = await response.json(); check();
      if (body.errors?.length) throw problem('Error del catálogo ERP', body.errors.map(error => error.message).join('; '), 0);
      if (!body.data) throw problem('Error del catálogo ERP', 'Respuesta de pacientes inválida.', 0);
      return body.data;
    } catch (error) {
      check();
      if (error.name === 'AbortError' || error instanceof ProblemDetailsError) throw error;
      throw problem('Fallo de conexión', 'No fue posible consultar el catálogo de pacientes ERP.', 0);
    }
  }
  return {
    configured, isActive,
    async listarPacientes(busqueda, signal) {
      const data = await query(`query PacientesClinicos($busqueda: String) { listarPacientes(busqueda: $busqueda) { ${fields} } }`, { busqueda }, signal);
      if (!Array.isArray(data.listarPacientes)) throw problem('Error del catálogo ERP', 'Respuesta de pacientes inválida.', 0);
      return data.listarPacientes.filter(paciente => paciente?.activo === true && UUID.test(paciente.id));
    },
    async validarPaciente(id, signal) {
      if (typeof id !== 'string' || !UUID.test(id)) throw problem('Paciente inválido', 'El identificador del paciente debe ser un UUID canónico.');
      const data = await query(`query PacienteClinico($id: UUID!) { obtenerPacientePorId(id: $id) { ${fields} } }`, { id }, signal);
      const paciente = data.obtenerPacientePorId;
      if (!paciente || paciente.activo !== true || paciente.id !== id) throw pacienteInexistente();
      return paciente;
    },
  };
}
