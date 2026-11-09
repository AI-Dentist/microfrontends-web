import { print } from 'graphql';
import * as mutations from './mutations.graphql';
it('exports the nullable active provider verification without changing existing QR operations', () => {
  expect(mutations).toHaveProperty('VERIFICAR_PAGO_QR_PAGOFACIL');
  const doc = print((mutations as any).VERIFICAR_PAGO_QR_PAGOFACIL);
  expect(doc).toContain('mutation VerificarPagoQrPagoFacil($pagofacilTransactionId: String!)');
  expect(doc).toContain('verificarPagoQrPagoFacil(pagofacilTransactionId: $pagofacilTransactionId)');
  expect(doc).toContain('numeroRecibo'); expect(doc).toContain('montoTotalBs');
  expect(mutations).toHaveProperty('GENERAR_QR_PAGOFACIL');
  expect(mutations).toHaveProperty('SIMULAR_CONFIRMACION_QR_DEV');
});
