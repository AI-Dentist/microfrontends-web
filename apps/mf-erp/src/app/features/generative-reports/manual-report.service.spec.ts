import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, throwError, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphQLError } from 'graphql';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import type { ReporteGenerativoPayload } from '../../core/graphql/models';
import {
  LISTAR_ENTIDADES_REPORTE,
  GENERAR_REPORTE_MANUAL,
  type EntidadReporte,
  type ReporteManualInput,
} from './manual-reports.graphql';
import { ManualReportService } from './manual-report.service';

const ENTIDADES_FIXTURE: EntidadReporte[] = [
  {
    clave: 'citas',
    nombre: 'Reservas / Citas',
    origen: 'ms3',
    columnas: [
      { clave: 'id_cita', etiqueta: 'ID Cita', tipo: 'TEXTO' },
      { clave: 'nombre_paciente', etiqueta: 'Nombre Paciente', tipo: 'TEXTO' },
      { clave: 'odontologo', etiqueta: 'Odontólogo', tipo: 'TEXTO' },
      { clave: 'fecha_hora', etiqueta: 'Fecha y Hora', tipo: 'FECHA_HORA' },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'TEXTO' },
      { clave: 'riesgo_no_show', etiqueta: 'Riesgo No-Show', tipo: 'TEXTO' },
    ],
    filtrosEstado: ['PROGRAMADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA'],
    filtroFecha: true,
  },
  {
    clave: 'pacientes',
    nombre: 'Pacientes',
    origen: 'ms1',
    columnas: [
      { clave: 'id', etiqueta: 'ID', tipo: 'TEXTO' },
      { clave: 'ciNit', etiqueta: 'CI / NIT', tipo: 'TEXTO' },
      { clave: 'nombres', etiqueta: 'Nombres', tipo: 'TEXTO' },
      { clave: 'apellidos', etiqueta: 'Apellidos', tipo: 'TEXTO' },
    ],
    filtrosEstado: [],
    filtroFecha: false,
  },
];

const makeReportFixture = (filasTruncadas: boolean | null = false): ReporteGenerativoPayload => ({
  reporteId: '00000000-0000-0000-0000-000000000001',
  consultaSqlEjecutada: 'SELECT id_cita, nombre_paciente FROM citas LIMIT 500',
  sqlGenerado: 'SELECT id_cita, nombre_paciente FROM citas',
  titulo: 'Reporte Manual de Reservas / Citas',
  resumenAnalitico: 'Reporte generado manualmente con 2 registros.',
  columnas: ['ID Cita', 'Nombre Paciente'],
  filas: [['CITA-001', 'Juan Perez'], ['CITA-002', 'Maria Lopez']],
  filasJson: JSON.stringify([
    { 'ID Cita': 'CITA-001', 'Nombre Paciente': 'Juan Perez' },
    { 'ID Cita': 'CITA-002', 'Nombre Paciente': 'Maria Lopez' },
  ]),
  tipoGraficoSugerido: 'TABLA',
  urlDescargaExcel: '/api/v1/export/excel/00000000-0000-0000-0000-000000000001',
  urlDescargaPdf: '/api/v1/export/pdf/00000000-0000-0000-0000-000000000001',
  filasTruncadas,
});

describe('ManualReportService', () => {
  let service: ManualReportService;
  const rolesSignal = signal<string[]>(['ADMIN']);
  const onlineSignal = signal<boolean>(true);
  let principalKeySignal: string | null = 'admin-principal-1';

  let apolloQueryMock: ReturnType<typeof vi.fn>;
  let apolloMutateMock: ReturnType<typeof vi.fn>;
  let authRefreshMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rolesSignal.set(['ADMIN']);
    onlineSignal.set(true);
    principalKeySignal = 'admin-principal-1';

    authRefreshMock = vi.fn(() => 'mock-token');

    apolloQueryMock = vi.fn((options: any) => {
      if (options.query === LISTAR_ENTIDADES_REPORTE) {
        return of({ data: { listarEntidadesReporte: ENTIDADES_FIXTURE } });
      }
      return of({ data: {} });
    });

    apolloMutateMock = vi.fn((options: any) => {
      if (options.mutation === GENERAR_REPORTE_MANUAL) {
        return of({ data: { generarReporteManual: makeReportFixture(false) } });
      }
      return of({ data: {} });
    });

    TestBed.configureTestingModule({
      providers: [
        ManualReportService,
        {
          provide: AuthContextService,
          useValue: {
            roles: rolesSignal,
            principalKey: () => principalKeySignal,
            refresh: authRefreshMock,
          },
        },
        {
          provide: NetworkStatusService,
          useValue: {
            online: onlineSignal,
            isOnline: () => onlineSignal(),
          },
        },
        {
          provide: Apollo,
          useValue: {
            query: apolloQueryMock,
            mutate: apolloMutateMock,
          },
        },
      ],
    });

    service = TestBed.inject(ManualReportService);
  });

  describe('listEntities()', () => {
    it('returns metadata entities in exact server order', async () => {
      const result = await service.listEntities();
      expect(result).toEqual(ENTIDADES_FIXTURE);
      expect(result[0].clave).toBe('citas');
      expect(result[1].clave).toBe('pacientes');
      expect(apolloQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: LISTAR_ENTIDADES_REPORTE,
          fetchPolicy: 'network-only',
        }),
      );
    });

    it('rejects non-ADMIN users with zero Apollo requests', async () => {
      rolesSignal.set(['CAJERO']);
      await expect(service.listEntities()).rejects.toThrow(/ADMIN/i);
      expect(apolloQueryMock).not.toHaveBeenCalled();
    });

    it('rejects offline calls with zero Apollo requests', async () => {
      onlineSignal.set(false);
      await expect(service.listEntities()).rejects.toThrow(/conexi[oó]n/i);
      expect(apolloQueryMock).not.toHaveBeenCalled();
    });

    it('throws sanitized error and does not return fake data when response is empty', async () => {
      apolloQueryMock.mockReturnValue(of({ data: { listarEntidadesReporte: null } }));
      await expect(service.listEntities()).rejects.toThrow(/no se recibieron entidades/i);
    });

    it('throws sanitized error on Apollo query error without fabricating data or leaking raw message', async () => {
      apolloQueryMock.mockReturnValue(
        throwError(() => new Error('Raw internal failure')),
      );
      await expect(service.listEntities()).rejects.toThrow('Error al consultar entidades de reporte.');
    });

    it('sanitizes GraphQL error on listEntities and does not leak raw SQL or tokens', async () => {
      const sentinelGqlError = new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Raw backend error: SELECT password_hash FROM users WHERE token="SECRET_TOKEN_LIST_123"',
            extensions: { code: 'SERVICE_UNAVAILABLE' },
          },
        ],
      });
      apolloQueryMock.mockReturnValue(throwError(() => sentinelGqlError));

      let capturedError: Error | null = null;
      try {
        await service.listEntities();
      } catch (err: any) {
        capturedError = err;
      }
      expect(capturedError).not.toBeNull();
      expect(capturedError!.message).not.toContain('SECRET_TOKEN_LIST_123');
      expect(capturedError!.message).not.toContain('password_hash');
      expect(capturedError!.message).toBe('Servicio no disponible al consultar entidades de reporte.');
    });

    it('sanitizes generic network Error on listEntities and does not leak connection string or tokens', async () => {
      apolloQueryMock.mockReturnValue(
        throwError(() => new Error('Connection failed to https://ms1.internal:8080/graphql?token=SECRET_AUTH_999')),
      );

      let capturedError: Error | null = null;
      try {
        await service.listEntities();
      } catch (err: any) {
        capturedError = err;
      }
      expect(capturedError).not.toBeNull();
      expect(capturedError!.message).not.toContain('SECRET_AUTH_999');
      expect(capturedError!.message).not.toContain('ms1.internal');
      expect(capturedError!.message).toBe('Error al consultar entidades de reporte.');
    });

    it('suppresses late results if user principal changes or is revoked during async call', async () => {
      const subject = new Subject<any>();
      apolloQueryMock.mockReturnValue(subject.asObservable());

      const promise = service.listEntities();
      // Principal changes before response arrives
      principalKeySignal = 'different-principal';

      subject.next({ data: { listarEntidadesReporte: ENTIDADES_FIXTURE } });
      subject.complete();

      await expect(promise).rejects.toThrow(/sesi[oó]n cambi[oó]/i);
    });
  });

  describe('preview()', () => {
    const sampleInput: ReporteManualInput = {
      entidad: 'citas',
      columnas: ['riesgo_no_show', 'nombre_paciente', 'id_cita'],
      fechaInicio: '2026-11-01T00:00:00.000Z',
      fechaFin: '2026-11-10T23:59:59.000Z',
      estado: 'CONFIRMADA',
    };

    it('forwards columnas in requested order and exact optional filters to Apollo mutation', async () => {
      const result = await service.preview(sampleInput);

      expect(apolloMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          mutation: GENERAR_REPORTE_MANUAL,
          variables: { input: sampleInput },
          fetchPolicy: 'no-cache',
        }),
      );
      expect(result.reporteId).toBe('00000000-0000-0000-0000-000000000001');
      expect(result.filasTruncadas).toBe(false);
    });

    it('passes fresh per-intention idempotencyKey and ownerPrincipal in Apollo context', async () => {
      await service.preview(sampleInput);

      const callArgs = apolloMutateMock.mock.calls[0][0];
      expect(callArgs.context).toBeDefined();
      expect(callArgs.context.ownerPrincipal).toBe('admin-principal-1');
      expect(typeof callArgs.context.idempotencyKey).toBe('string');
      expect(callArgs.context.idempotencyKey.length).toBeGreaterThan(10);
    });

    it('returns report with filasTruncadas = true when capped at 500 rows', async () => {
      apolloMutateMock.mockReturnValue(
        of({ data: { generarReporteManual: makeReportFixture(true) } }),
      );

      const result = await service.preview(sampleInput);
      expect(result.filasTruncadas).toBe(true);
    });

    it('returns report with filasTruncadas = null when not truncated / null', async () => {
      apolloMutateMock.mockReturnValue(
        of({ data: { generarReporteManual: makeReportFixture(null) } }),
      );

      const result = await service.preview(sampleInput);
      expect(result.filasTruncadas).toBeNull();
    });

    it('rejects non-ADMIN users with zero Apollo requests', async () => {
      rolesSignal.set(['RECEPCIONISTA']);
      await expect(service.preview(sampleInput)).rejects.toThrow(/ADMIN/i);
      expect(apolloMutateMock).not.toHaveBeenCalled();
    });

    it('rejects offline calls with zero Apollo requests', async () => {
      onlineSignal.set(false);
      await expect(service.preview(sampleInput)).rejects.toThrow(/conexi[oó]n/i);
      expect(apolloMutateMock).not.toHaveBeenCalled();
    });

    it('produces no fake report and sanitizes error when GraphQL returns BAD_REQUEST without leaking SQL/tokens', async () => {
      const badRequestError = new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Syntax error in SELECT secret_col FROM confidential_table WHERE key="SECRET_MUTATION_TOKEN_456"',
            extensions: { code: 'BAD_REQUEST' },
          },
        ],
      });
      apolloMutateMock.mockReturnValue(throwError(() => badRequestError));

      let capturedError: Error | null = null;
      try {
        await service.preview(sampleInput);
      } catch (err: any) {
        capturedError = err;
      }
      expect(capturedError).not.toBeNull();
      expect(capturedError!.message).not.toContain('SECRET_MUTATION_TOKEN_456');
      expect(capturedError!.message).not.toContain('confidential_table');
      expect(capturedError!.message).toBe('Parámetros del reporte inválidos.');
    });

    it('produces no fake report and sanitizes error when MS3 returns SERVICE_UNAVAILABLE without leaking endpoints/tokens', async () => {
      const serviceUnavailableError = new CombinedGraphQLErrors({
        errors: [
          {
            message: 'MS3 endpoint timeout at http://ms3.cluster.local:3000/api?secret=SECRET_MS3_KEY_789',
            extensions: { code: 'SERVICE_UNAVAILABLE' },
          },
        ],
      });
      apolloMutateMock.mockReturnValue(throwError(() => serviceUnavailableError));

      let capturedError: Error | null = null;
      try {
        await service.preview(sampleInput);
      } catch (err: any) {
        capturedError = err;
      }
      expect(capturedError).not.toBeNull();
      expect(capturedError!.message).not.toContain('SECRET_MS3_KEY_789');
      expect(capturedError!.message).not.toContain('ms3.cluster.local');
      expect(capturedError!.message).toBe('Servicio no disponible para generar el reporte.');
    });

    it('sanitizes generic network Error on preview and does not leak connection string or tokens', async () => {
      apolloMutateMock.mockReturnValue(
        throwError(() => new Error('Connection refused to http://ms1.backend:4000/graphql?token=SECRET_PREVIEW_NET_000')),
      );

      let capturedError: Error | null = null;
      try {
        await service.preview(sampleInput);
      } catch (err: any) {
        capturedError = err;
      }
      expect(capturedError).not.toBeNull();
      expect(capturedError!.message).not.toContain('SECRET_PREVIEW_NET_000');
      expect(capturedError!.message).not.toContain('ms1.backend');
      expect(capturedError!.message).toBe('Error al generar el reporte manual.');
    });

    it('throws sanitized error when mutation returns null response', async () => {
      apolloMutateMock.mockReturnValue(
        of({ data: { generarReporteManual: null } }),
      );

      await expect(service.preview(sampleInput)).rejects.toThrow(/no se recibió el reporte/i);
    });

    it('suppresses late results if user principal changed during preview generation', async () => {
      const subject = new Subject<any>();
      apolloMutateMock.mockReturnValue(subject.asObservable());

      const promise = service.preview(sampleInput);
      principalKeySignal = 'another-session-key';

      subject.next({ data: { generarReporteManual: makeReportFixture(false) } });
      subject.complete();

      await expect(promise).rejects.toThrow(/sesi[oó]n cambi[oó]/i);
    });

    it('ensures ReporteGenerativoPayload legacy consumers remain compatible with optional filasTruncadas', () => {
      const legacyPayload: ReporteGenerativoPayload = {
        reporteId: 'legacy-id',
        consultaSqlEjecutada: 'SELECT 1',
        columnas: ['A'],
        filasJson: '[]',
        tipoGraficoSugerido: 'TABLA',
        urlDescargaExcel: 'url1',
        urlDescargaPdf: 'url2',
      };
      expect(legacyPayload.filasTruncadas).toBeUndefined();
    });
  });
});
