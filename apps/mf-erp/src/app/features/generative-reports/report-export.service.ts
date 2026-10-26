import { Injectable, inject } from '@angular/core';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { ReporteGenerativoPayload } from '../../core/graphql/models';
import { buildRequestHeaders } from '../../core/graphql/request-headers';
import { environment } from '../../../environments/environment';
import { trustedReportExportUrl } from './report-data';

@Injectable({ providedIn: 'root' })
export class ReportExportService {
  private readonly auth = inject(AuthContextService);

  async download(report: ReporteGenerativoPayload, format: 'xlsx' | 'pdf'): Promise<void> {
    // Validate destination before reading credentials. Never follow a redirect with auth.
    const raw = format === 'xlsx' ? report.urlDescargaExcel : report.urlDescargaPdf;
    const url = trustedReportExportUrl(raw, environment.graphqlUrl, location.origin, report.reporteId, format);
    const token = this.auth.refresh();
    const owner = this.auth.principalKey();
    if (!owner || !this.auth.roles().includes('ADMIN')) throw new Error('Solo ADMIN puede exportar reportes propios.');
    const headers = buildRequestHeaders({ token, devUser: this.auth.devUserHeader() });
    if (!headers['Authorization'] && !headers['X-Dev-User']) throw new Error('Se requiere autenticación.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, { headers, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`Exportación rechazada (HTTP ${response.status}).`);
      const blob = await response.blob();
      this.auth.refresh();
      if (this.auth.principalKey() !== owner || !this.auth.roles().includes('ADMIN')) throw new Error('La sesión cambió.');
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      try {
        anchor.href = objectUrl;
        anchor.download = `reporte-${report.reporteId}.${format}`;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } finally { clearTimeout(timer); }
  }
}
