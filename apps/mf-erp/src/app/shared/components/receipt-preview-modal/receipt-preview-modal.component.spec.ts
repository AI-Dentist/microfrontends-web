import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { ReceiptPreviewModal } from './receipt-preview-modal.component';
import { Recibo } from '../../../core/graphql/models';

const receipt: Recibo = { id: 'r', numeroRecibo: 'REC-1', ciNitCliente: 'LOCAL-TEST', razonSocialCliente: 'Cliente de prueba', concepto: 'Servicio', montoTotalBs: 25, pdfUrlS3: null, enviadoWhatsapp: false, fechaEmision: '2026-10-22T10:00:00-04:00' };
describe('receipt truthfulness', () => {
  it('renders actual WhatsApp state and PDF unavailability without a fabricated payment method', async () => {
    await TestBed.configureTestingModule({ imports: [ReceiptPreviewModal], providers: [MessageService] }).compileComponents();
    const fixture = TestBed.createComponent(ReceiptPreviewModal);
    fixture.componentRef.setInput('recibo', receipt);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('WhatsApp no enviado');
    expect(fixture.nativeElement.textContent).toContain('PDF pendiente o no disponible');
    expect(fixture.nativeElement.textContent).not.toContain('Método de pago');
    fixture.componentRef.setInput('recibo', { ...receipt, enviadoWhatsapp: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('WhatsApp enviado');
    fixture.destroy();
  });
});
