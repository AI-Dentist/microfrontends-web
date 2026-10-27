import { OrdenCobro, Recibo, ServicioOdontologico } from '../../core/graphql/models';

export const serviceFixture: ServicioOdontologico = { id: 's', codigo: 'TEST', nombre: 'Servicio de prueba', precioBaseBs: 50, activo: true, descripcion: null, especialidad: null };
export const orderFixture: OrdenCobro = {
  id: 'o', consultaExternaId: null, paciente: { id: 'p', ciNit: 'TEST-1', nombres: 'Cliente', apellidos: 'Prueba', telefonoWhatsapp: '+59170000000', email: null, direccion: null, activo: true },
  odontologo: null, modalidadPago: 'CONTADO', montoSubtotalBs: 50, descuentoBs: 0, montoTotalBs: 50, saldoPendienteBs: 50, cantidadCuotas: 1, estado: 'PENDIENTE', createdAt: '2026-10-22T10:00:00-04:00',
  items: [{ id: 'i', servicio: serviceFixture, piezaDental: null, cantidad: 1, precioUnitarioBs: 50, subtotalBs: 50 }],
  cuotas: [{ id: 'q', numeroCuota: 1, montoCuotaBs: 50, fechaVencimiento: '2026-10-22', estado: 'PENDIENTE', fechaPago: null }],
};
export const receiptFixture: Recibo = { id: 'r', numeroRecibo: 'REC-TEST', ciNitCliente: 'TEST-1', razonSocialCliente: 'Cliente Prueba', concepto: 'Servicio de prueba', montoTotalBs: 50, pdfUrlS3: null, enviadoWhatsapp: false, fechaEmision: '2026-10-22T10:00:00-04:00' };

it('keeps finance fixtures in raw MS1 shape', () => {
  expect(orderFixture.cuotas[0].montoCuotaBs).toBe(orderFixture.montoTotalBs);
});
