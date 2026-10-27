import { describe, expect, it } from 'vitest';
import { isValidBolivianMobile, normalizeBolivianMobile, validatePatientDraft } from './patient-validation';

describe('normalizeBolivianMobile', () => {
  it('strips separators and the country code', () => {
    expect(normalizeBolivianMobile('+591 7123-4567')).toBe('71234567');
    expect(normalizeBolivianMobile('591 61234567')).toBe('61234567');
    expect(normalizeBolivianMobile('(712) 34567')).toBe('71234567');
  });
});

describe('isValidBolivianMobile', () => {
  it('accepts 8 digits starting with 6 or 7', () => {
    expect(isValidBolivianMobile('71234567')).toBe(true);
    expect(isValidBolivianMobile('+59161234567')).toBe(true);
  });

  it('rejects landlines, short numbers and letters', () => {
    expect(isValidBolivianMobile('32345678')).toBe(false);
    expect(isValidBolivianMobile('7123456')).toBe(false);
    expect(isValidBolivianMobile('712345678')).toBe(false);
    expect(isValidBolivianMobile('7123abcd')).toBe(false);
  });
});

describe('validatePatientDraft', () => {
  const valid = { ciNit: '1234567', nombres: 'Ana', apellidos: 'Rojas', telefonoWhatsapp: '71234567' };

  it('returns no errors for a valid draft', () => {
    expect(validatePatientDraft(valid)).toEqual({});
  });

  it('requires CI/NIT, nombres and apellidos', () => {
    const errors = validatePatientDraft({ ...valid, ciNit: '  ', nombres: '', apellidos: '' });
    expect(errors).toEqual({
      ciNit: 'El CI/NIT es obligatorio',
      nombres: 'Los nombres son obligatorios',
      apellidos: 'Los apellidos son obligatorios',
    });
  });

  it('requires WhatsApp and validates it when present', () => {
    expect(validatePatientDraft({ ...valid, telefonoWhatsapp: '' })).toEqual({ telefonoWhatsapp: 'El WhatsApp es obligatorio' });
    expect(validatePatientDraft({ ...valid, telefonoWhatsapp: null })).toEqual({ telefonoWhatsapp: 'El WhatsApp es obligatorio' });
    expect(validatePatientDraft({ ...valid, telefonoWhatsapp: '12345' })).toEqual({
      telefonoWhatsapp: 'Ingrese un celular boliviano válido (8 dígitos, inicia con 6 o 7)',
    });
  });
});
