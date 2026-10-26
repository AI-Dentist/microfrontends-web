import '@angular/compiler';
import { buildSchema, print, validate } from 'graphql';
import { MS1_SCHEMA_SDL } from '../../core/graphql/ms1-schema';
import { OBTENER_FLUJO_CAJA_SIN_PDF } from './cash-flow.graphql';

describe('receptionist cash flow selection', () => {
  it('validates against MS1 and never selects the role-protected PDF field', () => {
    expect(validate(buildSchema(MS1_SCHEMA_SDL), OBTENER_FLUJO_CAJA_SIN_PDF)).toEqual([]);
    const source = print(OBTENER_FLUJO_CAJA_SIN_PDF);
    expect(source).not.toContain('pdfUrlS3');
    expect(source).toContain('obtenerFlujoCaja');
    expect(source).toContain('enviadoWhatsapp');
    expect(source).toContain('DateTime!');
  });
});
