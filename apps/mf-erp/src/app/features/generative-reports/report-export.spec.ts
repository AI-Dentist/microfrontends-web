import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { DynamicReportViewer } from './dynamic-report-viewer.component';
import * as reportData from './report-data';
import { ERP_RUNTIME, ErpRuntimeContext } from '../../core/runtime/erp-runtime-context';
import { ReportExportService } from './report-export.service';

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
    expect(fetcher).toHaveBeenCalledWith(location.origin + path, expect.objectContaining({
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

describe('hosted export transport', () => {
  const jwt = (claims: object) => `e30.${btoa(JSON.stringify(claims))}.signature`;
  const hostToken = (sub = 'keycloak-subject') => jwt({ iss: 'https://issuer', sub, realm_access: { roles: ['ADMIN'] } });
  const endpoint = 'https://api.example/erp/graphql?tenant=a';
  const report = { reporteId: id, urlDescargaExcel: path, urlDescargaPdf: path.replace('xlsx', 'pdf') } as any;
  let current: string | null;
  let fetcher: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    current = hostToken();
    fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['bytes']) }));
    vi.stubGlobal('fetch', fetcher);
    // A stale browser credential must never be consulted by a hosted scope.
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'kc_token' ? jwt({ iss: 'https://legacy', sub: 'legacy', realm_access: { roles: ['ADMIN'] } }) : null });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    TestBed.configureTestingModule({ providers: [
      { provide: ERP_RUNTIME, useValue: new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: endpoint, getAccessToken: () => current }) },
    ] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('downloads from the hosted endpoint origin with the current host token on every request', async () => {
    const service = TestBed.inject(ReportExportService);
    await service.download(report, 'xlsx');
    current = hostToken();
    await service.download(report, 'pdf');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://api.example' + path, 'https://api.example' + path.replace('xlsx', 'pdf')]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Authorization: `Bearer ${hostToken()}` }, redirect: 'error', credentials: 'omit' });
    expect(fetcher.mock.calls[0][1].headers['X-Dev-User']).toBeUndefined();
  });
  it('rejects a URL outside the hosted endpoint origin before any HTTP', async () => {
    await expect(TestBed.inject(ReportExportService).download({ ...report, urlDescargaExcel: 'http://localhost:8080' + path }, 'xlsx'))
      .rejects.toThrow('URL de exportación no autorizada.');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects with zero HTTP when the host capability is null, and never revives after a later token', async () => {
    const service = TestBed.inject(ReportExportService);
    current = null;
    await expect(service.download(report, 'xlsx')).rejects.toThrow();
    current = hostToken();
    await expect(service.download(report, 'xlsx')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects with zero HTTP when the principal switched', async () => {
    const service = TestBed.inject(ReportExportService);
    await service.download(report, 'xlsx');
    fetcher.mockClear();
    current = hostToken('another-subject');
    await expect(service.download(report, 'xlsx')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
