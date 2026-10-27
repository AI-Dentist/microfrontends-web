import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { Recibo } from '../../../core/graphql/models';
import { BolivianosPipe } from '../../pipes/bolivianos.pipe';
import { ReceiptPdfService } from './receipt-pdf.service';

/** Receipt dialog with PDF download. Visible while `recibo` is not null. */
@Component({
  selector: 'erp-receipt-preview-modal',
  imports: [DatePipe, BolivianosPipe, DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      header="Recibo"
      [modal]="true"
      [visible]="!!recibo()"
      (visibleChange)="!$event && closed.emit()"
      [style]="{ width: '28rem' }"
    >
      @if (recibo(); as r) {
        <div class="space-y-3 text-sm" data-testid="receipt-preview">
          <p class="text-center text-xl font-semibold tracking-wide text-teal-700">{{ r.numeroRecibo }}</p>
          <dl class="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
            <dt class="text-slate-500">Fecha</dt>
            <dd>{{ r.fechaEmision | date: 'dd/MM/yyyy HH:mm' }}</dd>
            <dt class="text-slate-500">CI/NIT</dt>
            <dd>{{ r.ciNitCliente }}</dd>
            <dt class="text-slate-500">Razón Social</dt>
            <dd>{{ r.razonSocialCliente }}</dd>
            <dt class="text-slate-500">Concepto</dt>
            <dd>{{ r.concepto }}</dd>
            <dt class="text-slate-500">WhatsApp</dt>
            <dd>{{ r.enviadoWhatsapp ? 'WhatsApp enviado' : 'WhatsApp no enviado' }}</dd>
            <dt class="text-slate-500">Monto</dt>
            <dd class="text-lg font-semibold">{{ r.montoTotalBs | bolivianos }}</dd>
          </dl>
          @if (!r.pdfUrlS3) { <p>PDF pendiente o no disponible.</p> }
        </div>
      }
      <ng-template #footer>
        <p-button label="Cerrar" severity="secondary" [text]="true" (onClick)="closed.emit()" />
        <p-button type="button" label="Descargar PDF" [disabled]="!recibo()?.pdfUrlS3" [loading]="downloading()" (onClick)="download()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ReceiptPreviewModal {
  readonly recibo = input<Recibo | null>(null);
  readonly closed = output<void>();

  protected readonly downloading = signal(false);
  private readonly pdf = inject(ReceiptPdfService);
  private readonly messages = inject(MessageService);

  protected async download(): Promise<void> {
    const recibo = this.recibo();
    if (!recibo) {
      return;
    }
    this.downloading.set(true);
    try {
      await this.pdf.download(recibo.pdfUrlS3);
    } catch {
      this.messages.add({ severity: 'error', summary: 'Error', detail: 'No se pudo descargar el PDF del recibo.' });
    } finally {
      this.downloading.set(false);
    }
  }
}
