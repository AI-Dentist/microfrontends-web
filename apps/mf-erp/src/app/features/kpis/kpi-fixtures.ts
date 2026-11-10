import type { KpisFinancieros, ObtenerKpisFinancierosResponse } from './kpis.graphql';
import type { KpisAgendaEnvelope } from './kpi-agenda.service';

export const FULL_KPIS_FINANCIEROS_FIXTURE: KpisFinancieros = {
  fechaInicio: '2026-11-01T00:00:00-04:00',
  fechaFin: '2026-11-30T23:59:59.999-04:00',
  ingresos: {
    totalBs: 25400.5,
    cantidadMovimientos: 18,
    montoNominalQrBs: 5400.0,
    seriePorDia: [
      { fecha: '2026-11-02', montoBs: 1200.0 },
      { fecha: '2026-11-05', montoBs: 4500.5 },
      { fecha: '2026-11-12', montoBs: 8000.0 },
      { fecha: '2026-11-20', montoBs: 11700.0 },
    ],
  },
  morosidad: {
    cuotasVencidas: 3,
    cuotasExigibles: 15,
    porcentaje: 20.0,
    montoVencidoBs: 4500.0,
    detalle: [
      {
        cuotaId: 'c1000000-0000-0000-0000-000000000001',
        ordenCobroId: 'o1000000-0000-0000-0000-000000000001',
        pacienteId: 'p1000000-0000-0000-0000-000000000001',
        pacienteNombre: 'Juan Perez',
        numeroCuota: 2,
        montoBs: 1500.0,
        fechaVencimiento: '2026-11-05',
        diasAtraso: 5,
      },
      {
        cuotaId: 'c1000000-0000-0000-0000-000000000002',
        ordenCobroId: 'o1000000-0000-0000-0000-000000000002',
        pacienteId: 'p1000000-0000-0000-0000-000000000002',
        pacienteNombre: 'Maria Lopez',
        numeroCuota: 1,
        montoBs: 2000.0,
        fechaVencimiento: '2026-11-07',
        diasAtraso: 3,
      },
      {
        cuotaId: 'c1000000-0000-0000-0000-000000000003',
        ordenCobroId: 'o1000000-0000-0000-0000-000000000003',
        pacienteId: 'p1000000-0000-0000-0000-000000000003',
        pacienteNombre: 'Carlos Mendez',
        numeroCuota: 3,
        montoBs: 1000.0,
        fechaVencimiento: '2026-11-09',
        diasAtraso: 1,
      },
    ],
  },
  serviciosMasSolicitados: [
    {
      servicioId: 's1000000-0000-0000-0000-000000000001',
      nombre: 'Limpieza Dental Ultrasonica',
      cantidad: 24,
      montoBs: 4800.0,
    },
    {
      servicioId: 's1000000-0000-0000-0000-000000000002',
      nombre: 'Restauracion Resina Compuesta',
      cantidad: 16,
      montoBs: 6400.0,
    },
    {
      servicioId: 's1000000-0000-0000-0000-000000000003',
      nombre: 'Endodoncia Unirradicular',
      cantidad: 6,
      montoBs: 4200.0,
    },
  ],
  flujoCaja: {
    totalIngresosBs: 25400.5,
    totalEgresosBs: 8200.0,
    saldoNetoBs: 17200.5,
    seriePorDia: [
      { fecha: '2026-11-02', ingresosBs: 1200.0, egresosBs: 500.0, saldoBs: 700.0 },
      { fecha: '2026-11-05', ingresosBs: 4500.5, egresosBs: 1200.0, saldoBs: 3300.5 },
      { fecha: '2026-11-12', ingresosBs: 8000.0, egresosBs: 4000.0, saldoBs: 4000.0 },
      { fecha: '2026-11-20', ingresosBs: 11700.0, egresosBs: 2500.0, saldoBs: 9200.0 },
    ],
  },
  cobranzaPorMetodo: [
    {
      metodoPago: 'EFECTIVO',
      cantidad: 10,
      montoBs: 14000.5,
      porcentajeMonto: 55.12,
      montoNominal: false,
    },
    {
      metodoPago: 'QR_PAGOFACIL',
      cantidad: 5,
      montoBs: 5400.0,
      porcentajeMonto: 21.26,
      montoNominal: true,
    },
    {
      metodoPago: 'TRANSFERENCIA',
      cantidad: 3,
      montoBs: 6000.0,
      porcentajeMonto: 23.62,
      montoNominal: false,
    },
  ],
};

export const FULL_KPIS_FINANCIEROS_RESPONSE_FIXTURE: ObtenerKpisFinancierosResponse = {
  obtenerKpisFinancieros: FULL_KPIS_FINANCIEROS_FIXTURE,
};

export const EMPTY_KPIS_FINANCIEROS_FIXTURE: KpisFinancieros = {
  fechaInicio: '2026-11-01T00:00:00-04:00',
  fechaFin: '2026-11-30T23:59:59.999-04:00',
  ingresos: {
    totalBs: 0,
    cantidadMovimientos: 0,
    montoNominalQrBs: 0,
    seriePorDia: [],
  },
  morosidad: {
    cuotasVencidas: 0,
    cuotasExigibles: 0,
    porcentaje: 0,
    montoVencidoBs: 0,
    detalle: [],
  },
  serviciosMasSolicitados: [],
  flujoCaja: {
    totalIngresosBs: 0,
    totalEgresosBs: 0,
    saldoNetoBs: 0,
    seriePorDia: [],
  },
  cobranzaPorMetodo: [
    {
      metodoPago: 'EFECTIVO',
      cantidad: 0,
      montoBs: 0,
      porcentajeMonto: 0,
      montoNominal: false,
    },
    {
      metodoPago: 'QR_PAGOFACIL',
      cantidad: 0,
      montoBs: 0,
      porcentajeMonto: 0,
      montoNominal: true,
    },
    {
      metodoPago: 'TRANSFERENCIA',
      cantidad: 0,
      montoBs: 0,
      porcentajeMonto: 0,
      montoNominal: false,
    },
  ],
};

export const EMPTY_KPIS_FINANCIEROS_RESPONSE_FIXTURE: ObtenerKpisFinancierosResponse = {
  obtenerKpisFinancieros: EMPTY_KPIS_FINANCIEROS_FIXTURE,
};

export const FULL_KPIS_AGENDA_ENVELOPE_FIXTURE: KpisAgendaEnvelope = {
  success: true,
  data: {
    periodo: { desde: '2026-11-01', hasta: '2026-11-30' },
    pacientesFrecuentes: [
      { pacienteId: 'p1000000-0000-0000-0000-000000000001', totalCitas: 4, completadas: 3 },
      { pacienteId: 'p1000000-0000-0000-0000-000000000002', totalCitas: 3, completadas: 3 },
      { pacienteId: 'p1000000-0000-0000-0000-000000000003', totalCitas: 2, completadas: 1 },
    ],
    inasistencia: {
      citasEvaluadas: 10,
      noAsistio: 2,
      porcentaje: 20.0,
      detalle: [
        {
          citaId: 'a1000000-0000-0000-0000-000000000001',
          pacienteId: 'p1000000-0000-0000-0000-000000000001',
          odontologoId: 'd1000000-0000-0000-0000-000000000001',
          fechaHora: '2026-11-04T10:00:00',
        },
        {
          citaId: 'a1000000-0000-0000-0000-000000000002',
          pacienteId: 'p1000000-0000-0000-0000-000000000003',
          odontologoId: 'd1000000-0000-0000-0000-000000000002',
          fechaHora: '2026-11-08T15:30:00',
        },
      ],
    },
    horariosPico: {
      porDiaHora: [
        { diaSemana: 1, hora: 9, citas: 3 },
        { diaSemana: 2, hora: 14, citas: 4 },
        { diaSemana: 3, hora: 10, citas: 5 },
        { diaSemana: 5, hora: 16, citas: 2 },
      ],
      top: [
        { diaSemana: 3, hora: 10, citas: 5 },
        { diaSemana: 2, hora: 14, citas: 4 },
        { diaSemana: 1, hora: 9, citas: 3 },
        { diaSemana: 5, hora: 16, citas: 2 },
      ],
    },
    insumosCriticos: [
      {
        insumoId: 'i1000000-0000-0000-0000-000000000001',
        nombre: 'Anestesia Lidocaina 2% c/epinefrina',
        stockActual: 2,
        stockMinimo: 10,
        bajoMinimo: true,
        salidasPeriodo: 35,
      },
      {
        insumoId: 'i1000000-0000-0000-0000-000000000002',
        nombre: 'Guantes de Nitrilo Talla M (caja)',
        stockActual: 4,
        stockMinimo: 8,
        bajoMinimo: true,
        salidasPeriodo: 14,
      },
      {
        insumoId: 'i1000000-0000-0000-0000-000000000003',
        nombre: 'Agujas Dentales Descartables 27G',
        stockActual: 45,
        stockMinimo: 20,
        bajoMinimo: false,
        salidasPeriodo: 60,
      },
    ],
    productividadOdontologos: [
      {
        odontologoId: 'd1000000-0000-0000-0000-000000000001',
        citasTotales: 12,
        citasCompletadas: 10,
        tasaCompletadas: 83.33,
      },
      {
        odontologoId: 'd1000000-0000-0000-0000-000000000002',
        citasTotales: 8,
        citasCompletadas: 6,
        tasaCompletadas: 75.0,
      },
    ],
  },
  timestamp: '2026-11-10T02:00:00Z',
};

export const EMPTY_KPIS_AGENDA_ENVELOPE_FIXTURE: KpisAgendaEnvelope = {
  success: true,
  data: {
    periodo: { desde: '2026-11-01', hasta: '2026-11-30' },
    pacientesFrecuentes: [],
    inasistencia: {
      citasEvaluadas: 0,
      noAsistio: 0,
      porcentaje: 0,
      detalle: [],
    },
    horariosPico: {
      porDiaHora: [],
      top: [],
    },
    insumosCriticos: [],
    productividadOdontologos: [],
  },
  timestamp: '2026-11-10T02:00:00Z',
};
