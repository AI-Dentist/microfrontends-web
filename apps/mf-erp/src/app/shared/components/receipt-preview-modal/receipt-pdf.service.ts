import { Injectable } from '@angular/core';

/** Signed storage URLs must never pass through authenticated API clients, even on the same origin. */
@Injectable({ providedIn: 'root' })
export class ReceiptPdfService {
  async download(pdfUrlS3: string | null | undefined): Promise<void> {
    if (!pdfUrlS3) throw new Error('PDF pendiente o no disponible.');
    const url = new URL(pdfUrlS3, globalThis.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL de PDF no válida.');
    // Navigation performs a simple GET with no Authorization or X-Dev-User headers.
    globalThis.open(pdfUrlS3, '_blank', 'noopener,noreferrer');
  }
}
