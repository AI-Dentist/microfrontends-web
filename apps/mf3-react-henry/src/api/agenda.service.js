import { ProblemDetailsError } from './problem-details.js';

// States MS2 accepts when opening a consulta from an appointment
// (ESTADOS_VALIDOS_ATENCION in the MS2 MS3 appointment validator).
export const ESTADOS_CITA_ABRIBLES = [
  'RESERVADA', 'CONFIRMADA', 'EN_ATENCION', 'PROGRAMADA', 'PENDIENTE', 'REPROGRAMADA',
];

const text = value => String(value ?? '').trim();

// MS3 serializes snake_case (Cita::toArray); camelCase is tolerated as MS2 does.
function normalizar(raw) {
  return {
    id: text(raw.id),
    pacienteId: text(raw.paciente_id ?? raw.pacienteId ?? raw.paciente?.id),
    odontologoId: text(raw.odontologo_id ?? raw.odontologoId),
    consultorioId: text(raw.consultorio_id ?? raw.consultorioId),
    fechaHora: text(raw.fecha_hora ?? raw.fechaHora),
    estado: text(raw.estado).toUpperCase(),
  };
}

export function agendaNoConfigurada() {
  return new ProblemDetailsError({
    type: 'https://api.odontoclinic.local/errors/agenda-not-configured',
    title: 'Agenda no disponible',
    status: 0,
    detail: 'El host no configuró el servicio de agenda (MS3); no se pueden listar citas.',
  });
}

/**
 * Read-only MS3 appointments client. Without a client (hosted without an agenda
 * base) every call fails closed before any HTTP.
 */
export function createAgendaService(client = null) {
  return {
    configured: Boolean(client),
    async listarCitas(signal) {
      if (!client) throw agendaNoConfigurada();
      const body = await client('/citas', { signal });
      const citas = body?.data?.citas ?? body?.citas ?? [];
      return (Array.isArray(citas) ? citas : [])
        .map(normalizar)
        .filter(cita => cita.id && ESTADOS_CITA_ABRIBLES.includes(cita.estado));
    },
  };
}
