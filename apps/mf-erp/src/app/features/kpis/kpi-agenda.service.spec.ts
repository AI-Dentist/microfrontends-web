import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { KpiAgendaService, KpiAgendaError, resolveAgendaApiBaseUrl } from './kpi-agenda.service';
import { ERP_RUNTIME, ErpRuntimeContext } from '../../core/runtime/erp-runtime-context';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { environment } from '../../../environments/environment';
import { FULL_KPIS_AGENDA_ENVELOPE_FIXTURE, EMPTY_KPIS_AGENDA_ENVELOPE_FIXTURE } from './kpi-fixtures';

describe('KpiAgendaService', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('resolveAgendaApiBaseUrl', () => {
    it('builds exact URL for standalone mode using environment.agendaApiUrl', () => {
      const runtime = new ErpRuntimeContext();
      const base = resolveAgendaApiBaseUrl(runtime, '/api/agendamiento', 'http://localhost:4200');
      expect(base).toBe('/api/agendamiento');
    });

    it('builds exact URL for hosted relative endpoint resolved against location.origin', () => {
      const runtime = new ErpRuntimeContext({
        mode: 'hosted',
        graphqlUrl: '/api/erp/graphql',
        getAccessToken: () => 'token',
      });
      const base = resolveAgendaApiBaseUrl(runtime, '/api/agendamiento', 'http://localhost:4200');
      expect(base).toBe('http://localhost:4200/api/agendamiento');
    });

    it('builds exact URL for hosted absolute endpoint', () => {
      const runtime = new ErpRuntimeContext({
        mode: 'hosted',
        graphqlUrl: 'https://gateway.example.com:8443/api/erp/graphql',
        getAccessToken: () => 'token',
      });
      const base = resolveAgendaApiBaseUrl(runtime, '/api/agendamiento', 'http://localhost:4200');
      expect(base).toBe('https://gateway.example.com:8443/api/agendamiento');
    });

    it('builds exact URL for explicit config.agendaApiUrl', () => {
      const runtime = new ErpRuntimeContext({
        agendaApiUrl: 'https://agenda.internal.net/api/agendamiento',
      });
      const base = resolveAgendaApiBaseUrl(runtime, '/api/agendamiento', 'http://localhost:4200');
      expect(base).toBe('https://agenda.internal.net/api/agendamiento');
    });
  });

  describe('load() execution and fetch contract', () => {
    function setupService(runtimeConfig: any = null, mockToken = 'mock-jwt-token') {
      const runtime = new ErpRuntimeContext(runtimeConfig);
      const mockAuth = {
        refresh: vi.fn().mockReturnValue(mockToken),
        devUserHeader: vi.fn().mockReturnValue(mockToken ? null : 'admin-scz'),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          KpiAgendaService,
          { provide: ERP_RUNTIME, useValue: runtime },
          { provide: AuthContextService, useValue: mockAuth },
        ],
      });

      return {
        service: TestBed.inject(KpiAgendaService),
        runtime,
        auth: mockAuth,
      };
    }

    it('issues GET with exact URL params, auth headers, and security options', async () => {
      const { service, auth } = setupService({
        mode: 'hosted',
        graphqlUrl: 'https://gateway.example.com/api/erp/graphql',
        getAccessToken: () => 'test-bearer-token',
      }, 'test-bearer-token');

      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation(async (url: any, init: any) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(JSON.stringify(FULL_KPIS_AGENDA_ENVELOPE_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const period = { desde: '2026-11-01', hasta: '2026-11-30' };
      const data = await service.load(period);

      expect(auth.refresh).toHaveBeenCalled();
      expect(capturedUrl).toBe('https://gateway.example.com/api/agendamiento/kpis?desde=2026-11-01&hasta=2026-11-30');
      expect(capturedInit?.method).toBe('GET');
      expect(capturedInit?.body).toBeUndefined();
      expect(capturedInit?.redirect).toBe('error');
      expect(capturedInit?.credentials).toBe('omit');
      expect(capturedInit?.cache).toBe('no-store');
      expect((capturedInit?.headers as any)['Authorization']).toBe('Bearer test-bearer-token');
      expect(data).toEqual(FULL_KPIS_AGENDA_ENVELOPE_FIXTURE.data);
    });

    it('resolves empty S6 envelope to empty lists without fabricating data', async () => {
      const { service } = setupService();

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(EMPTY_KPIS_AGENDA_ENVELOPE_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const period = { desde: '2026-11-01', hasta: '2026-11-30' };
      const data = await service.load(period);

      expect(data.pacientesFrecuentes).toEqual([]);
      expect(data.inasistencia.citasEvaluadas).toBe(0);
      expect(data.inasistencia.detalle).toEqual([]);
      expect(data.horariosPico.porDiaHora).toEqual([]);
      expect(data.horariosPico.top).toEqual([]);
      expect(data.insumosCriticos).toEqual([]);
      expect(data.productividadOdontologos).toEqual([]);
    });

    it.each([401, 403, 422, 500])('rejects non-2xx HTTP %i with typed status and sanitized message', async (status) => {
      const { service } = setupService();

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Secret backend internal leak or token' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const period = { desde: '2026-11-01', hasta: '2026-11-30' };
      await expect(service.load(period)).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(KpiAgendaError);
        const kpiErr = err as KpiAgendaError;
        expect(kpiErr.status).toBe(status);
        expect(kpiErr.message).not.toContain('Secret');
        expect(kpiErr.message).not.toContain('token');
        return true;
      });
    });

    it('rejects malformed response envelope without fabricating data', async () => {
      const { service } = setupService();

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, data: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const period = { desde: '2026-11-01', hasta: '2026-11-30' };
      await expect(service.load(period)).rejects.toThrow(KpiAgendaError);
    });

    it('rejects timeout with typed error', async () => {
      const { service } = setupService();

      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        const error = new Error('The operation was aborted');
        (error as any).name = 'AbortError';
        throw error;
      });

      const period = { desde: '2026-11-01', hasta: '2026-11-30' };
      await expect(service.load(period)).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(KpiAgendaError);
        const kpiErr = err as KpiAgendaError;
        expect(kpiErr.code).toBe('TIMEOUT');
        return true;
      });
    });
  });
});
