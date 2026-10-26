import { ActualizarPacienteInput, Paciente } from '../../core/graphql/models';
import { normalizeBolivianMobile, PatientErrors, validatePatientDraft } from './patient-validation';

const requiredFields = ['ciNit', 'nombres', 'apellidos', 'telefonoWhatsapp'] as const;
const nullableFields = ['email', 'direccion', 'fechaNacimiento', 'genero'] as const;
export type CompletePatient = Paciente & { fechaNacimiento: string | null; genero: string | null };
export type PatientEditDraft = Record<typeof requiredFields[number] | typeof nullableFields[number], string>;

/** No coercion: absent/undefined legacy fields cannot authorize a replacement. */
export function isCompletePatient(value: unknown, id: string): value is CompletePatient {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row['id'] === id && typeof row['activo'] === 'boolean' &&
    requiredFields.every(key => Object.hasOwn(row, key) && typeof row[key] === 'string') &&
    nullableFields.every(key => Object.hasOwn(row, key) && (row[key] === null || typeof row[key] === 'string')) &&
    (row['fechaNacimiento'] === null || isIsoDate(row['fechaNacimiento'] as string));
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function patientEditDraft(patient: CompletePatient): PatientEditDraft {
  return {
    ciNit: patient.ciNit, nombres: patient.nombres, apellidos: patient.apellidos,
    telefonoWhatsapp: patient.telefonoWhatsapp, email: patient.email ?? '',
    direccion: patient.direccion ?? '', fechaNacimiento: patient.fechaNacimiento ?? '', genero: patient.genero ?? '',
  };
}

/** Validate only changed required fields; existing backend values are not ours to rewrite. */
export function patientEditErrors(draft: PatientEditDraft, initial: PatientEditDraft): PatientErrors {
  const errors = validatePatientDraft(draft);
  for (const key of requiredFields) if (draft[key] === initial[key]) delete errors[key];
  return errors;
}

export function patientReplacement(patient: CompletePatient, initial: PatientEditDraft, draft: PatientEditDraft): ActualizarPacienteInput {
  const input: ActualizarPacienteInput = {
    ciNit: patient.ciNit, nombres: patient.nombres, apellidos: patient.apellidos,
    telefonoWhatsapp: patient.telefonoWhatsapp, email: patient.email, direccion: patient.direccion,
    fechaNacimiento: patient.fechaNacimiento, genero: patient.genero,
  };
  for (const key of requiredFields) {
    if (draft[key] !== initial[key]) input[key] = key === 'telefonoWhatsapp' ? normalizeBolivianMobile(draft[key].trim()) : draft[key].trim();
  }
  for (const key of nullableFields) {
    if (draft[key] !== initial[key]) input[key] = (key === 'fechaNacimiento' ? draft[key] : draft[key].trim()) || null;
  }
  return input;
}
