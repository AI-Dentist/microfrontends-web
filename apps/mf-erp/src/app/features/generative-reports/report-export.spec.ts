import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { DynamicReportViewer } from './dynamic-report-viewer.component';
import * as reportData from './report-data';

const id = '00000000-0000-4000-8000-000000000010';
const path = `/api/v1/reports/export/${id}/xlsx`;
const origin = 'http://localhost:8080';
const trusted = (url: string, format = 'xlsx') =>
  (reportData as any).trustedReportExportUrl(url, origin + '/graphql', 'http://localhost:4201', id, format);

it.each(['xlsx', 'pdf'])('accepts only the current report %s route on the configured backend', (format) => {
  const url = `/api/v1/reports/export/${id}/${format}`;
  expect(trusted(url, format)).toBe(origin + url);
  expect(trusted(origin + url, format)).toBe(origin + url);
});
it.each([
  'https://evil.example' + path, 'http://localhost:4201' + path,
  path.replace(id, 'another-report'), path.replace('xlsx', 'pdf'),
  '/api/v1/reportes/' + id + '.xlsx', 'http://name:secret@localhost:8080' + path,
  path + '?access_token=secret', path + '#fragment', 'javascript:alert(1)',
])('rejects unsafe export URL before credentials or HTTP: %s', (url) => {
  expect(() => trusted(url)).toThrow('URL de exportación no autorizada.');
});

describe('report export through the public viewer', () => {
  let fetcher: ReturnType<typeof vi.fn>;
  let httpGet: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;
  let devUser: string | null;
  let token: string | null;
  let create: ReturnType<typeof vi.fn>;
  let blob: Blob;
  beforeEach(() => {
    blob = new Blob(['exported bytes'], { type: 'application/octet-stream' });
    fetcher = vi.fn(async () => ({ ok: true, blob: async () => blob }));
    httpGet = vi.fn(() => of(blob));
    token = 'current-token'; devUser = null;
    refresh = vi.fn(() => token);
    const NativeUrl = URL;
    create = vi.fn(() => 'blob:http://localhost/report');
    vi.stubGlobal('URL', class extends NativeUrl {
      static override createObjectURL = create as any;
      static override revokeObjectURL = vi.fn();
    });
    vi.stubGlobal('fetch', fetcher);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    TestBed.configureTestingModule({ imports: [DynamicReportViewer], providers: [
      { provide: HttpClient, useValue: { get: httpGet } },
      { provide: MessageService, useValue: { add: vi.fn() } },
      { provide: AuthContextService, useValue: { roles: signal(['ADMIN']), refresh,
        devUserHeader: () => devUser, principalKey: () => 'owner' } },
    ] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function download() {
    const fixture = TestBed.createComponent(DynamicReportViewer);
    fixture.componentRef.setInput('report', { reporteId: id, preguntaOriginal: '', explicacionNatural: '',
      consultaSqlEjecutada: '', columnas: [], filasJson: '[]', tipoGraficoSugerido: 'TABLA',
      urlDescargaExcel: path, urlDescargaPdf: path.replace('xlsx', 'pdf') });
    await fixture.whenStable();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Exportar a Excel')) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    return fixture;
  }
  it('fetches with current Bearer, blocks redirects/cookies, downloads the response blob and never uses unauthenticated open', async () => {
    await download();
    expect(fetcher).toHaveBeenCalledWith(origin + path, expect.objectContaining({
      headers: { Authorization: 'Bearer current-token' }, redirect: 'error', credentials: 'omit',
    }));
    expect(httpGet).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(blob);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });
  it('uses only the explicit development identity when no Bearer exists', async () => {
    token = null; devUser = 'admin-scz';
    await download();
    expect(fetcher.mock.calls[0]?.[1].headers).toEqual({ 'X-Dev-User': 'admin-scz' });
  });
  it('sends nothing and downloads nothing when refresh rejects supplied credentials', async () => {
    refresh.mockImplementation(() => { throw new Error('Credencial inválida'); });
    await download();
    expect(fetcher).not.toHaveBeenCalled();
    expect(httpGet).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it('never fabricates a file for an unauthorized response', async () => {
    fetcher.mockResolvedValue({ ok: false, status: 403 });
    await download();
    expect(create).not.toHaveBeenCalled();
  });
});
