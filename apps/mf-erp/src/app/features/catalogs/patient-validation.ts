export interface PatientDraft {
  ciNit: string;
  nombres: string;
  apellidos: string;
  telefonoWhatsapp?: string | null;
}

export type PatientErrors = Partial<Record<'ciNit' | 'nombres' | 'apellidos' | 'telefonoWhatsapp', string>>;

/** Removes separators and the +591 country code, leaving the national number. */
export function normalizeBolivianMobile(value: string): string {
  const compact = value.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  return compact.startsWith('591') && compact.length > 8 ? compact.slice(3) : compact;
}

/** Bolivian mobile numbers have 8 digits and start with 6 or 7. */
export function isValidBolivianMobile(value: string): boolean {
  return /^[67]\d{7}$/.test(normalizeBolivianMobile(value));
}

export function validatePatientDraft(draft: PatientDraft): PatientErrors {
  const errors: PatientErrors = {};
  if (!draft.ciNit.trim()) errors.ciNit = 'El CI/NIT es obligatorio';
  if (!draft.nombres.trim()) errors.nombres = 'Los nombres son obligatorios';
  if (!draft.apellidos.trim()) errors.apellidos = 'Los apellidos son obligatorios';
  const whatsapp = draft.telefonoWhatsapp?.trim();
  if (!whatsapp) errors.telefonoWhatsapp = 'El WhatsApp es obligatorio';
  else if (!isValidBolivianMobile(whatsapp)) {
    errors.telefonoWhatsapp = 'Ingrese un celular boliviano válido (8 dígitos, inicia con 6 o 7)';
  }
  return errors;
}
