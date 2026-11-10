import type { KpiId } from './kpi-definitions';
import type { KpisFinancieros } from './kpis.graphql';
import type { KpisAgenda } from './kpi-agenda.service';

export interface KpiTableColumn {
  key: string;
  label: string;
}

export interface KpiTableData {
  columns: KpiTableColumn[];
  rows: Record<string, any>[];
}

export interface KpiHeadline {
  primary: string;
  secondary?: string;
  unit?: string;
}

export interface KpiViewResult {
  kpiId: KpiId;
  headline: KpiHeadline;
  chartOptions: Record<string, any>;
  table: KpiTableData;
}

export interface NameMaps {
  pacientes?: Map<string, string> | Record<string, string>;
  odontologos?: Map<string, string> | Record<string, string>;
}

export const ISO_WEEKDAYS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export function formatWeekday(day: number): string {
  return ISO_WEEKDAYS[day] ?? `Día ${day}`;
}

export function formatBs(amount: number): string {
  const num = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const parts = num.toFixed(2).split('.');
  const integerWithDots = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${integerWithDots},${parts[1]}`;
}

export function resolveName(
  id: string,
  map?: Map<string, string> | Record<string, string>,
  type: 'Paciente' | 'Odontólogo' = 'Paciente',
): string {
  if (!id) return `${type} desconocido`;
  let found: string | undefined;
  if (map instanceof Map) {
    found = map.get(id);
  } else if (map && typeof map === 'object') {
    found = (map as Record<string, string>)[id];
  }
  if (found && found.trim()) return found.trim();
  const shortId = id.length > 8 ? id.substring(0, 8) : id;
  return `${type} no encontrado (${shortId})`;
}

// ---------------------------------------------------------------------------
// 1. Ingresos del período (Bs)
// ---------------------------------------------------------------------------
export function buildIngresosView(data: KpisFinancieros): KpiViewResult {
  const serie = data.ingresos.seriePorDia ?? [];
  return {
    kpiId: 'ingresos',
    headline: {
      primary: `Bs ${formatBs(data.ingresos.totalBs)}`,
      secondary: `${data.ingresos.cantidadMovimientos} movimientos registrados`,
      unit: 'Bs',
    },
    chartOptions: {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: serie.map((s) => s.fecha) },
      yAxis: { type: 'value', name: 'Bs' },
      series: [
        {
          name: 'Ingresos (Bs)',
          type: 'bar',
          data: serie.map((s) => s.montoBs),
        },
      ],
    },
    table: {
      columns: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'montoBs', label: 'Monto (Bs)' },
      ],
      rows: serie.map((s) => ({
        fecha: s.fecha,
        montoBs: s.montoBs,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Morosidad: cuotas vencidas (% y Bs)
// ---------------------------------------------------------------------------
export function buildMorosidadView(data: KpisFinancieros, nameMaps?: NameMaps): KpiViewResult {
  const detalle = data.morosidad.detalle ?? [];
  return {
    kpiId: 'morosidad',
    headline: {
      primary: `${data.morosidad.porcentaje.toFixed(2).replace(/\.?0+$/, '')}%`,
      secondary: `Bs ${formatBs(data.morosidad.montoVencidoBs)} en mora (${data.morosidad.cuotasVencidas} de ${data.morosidad.cuotasExigibles} cuotas)`,
      unit: '%',
    },
    chartOptions: {
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: detalle.map((d) => {
          const mapped = resolveName(d.pacienteId, nameMaps?.pacientes, 'Paciente');
          return mapped !== `Paciente no encontrado (${d.pacienteId.substring(0, 8)})` ? mapped : (d.pacienteNombre || mapped);
        }),
      },
      yAxis: { type: 'value', name: 'Bs' },
      series: [
        {
          name: 'Monto Vencido (Bs)',
          type: 'bar',
          data: detalle.map((d) => d.montoBs),
        },
      ],
    },
    table: {
      columns: [
        { key: 'paciente', label: 'Paciente' },
        { key: 'numeroCuota', label: 'Nº Cuota' },
        { key: 'montoBs', label: 'Monto Vencido (Bs)' },
        { key: 'fechaVencimiento', label: 'Vencimiento' },
        { key: 'diasAtraso', label: 'Días de atraso' },
      ],
      rows: detalle.map((d) => {
        const mapped = resolveName(d.pacienteId, nameMaps?.pacientes, 'Paciente');
        const paciente = mapped !== `Paciente no encontrado (${d.pacienteId.substring(0, 8)})` ? mapped : (d.pacienteNombre || mapped);
        return {
          cuotaId: d.cuotaId,
          paciente,
          numeroCuota: d.numeroCuota,
          montoBs: d.montoBs,
          fechaVencimiento: d.fechaVencimiento,
          diasAtraso: d.diasAtraso,
        };
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Pacientes más frecuentes (ranking)
// ---------------------------------------------------------------------------
export function buildPacientesFrecuentesView(data: KpisAgenda, nameMaps?: NameMaps): KpiViewResult {
  const ranking = data.pacientesFrecuentes ?? [];
  return {
    kpiId: 'pacientes-frecuentes',
    headline: {
      primary: `${ranking.length} pacientes frecuentes`,
      secondary: ranking.length > 0 ? `Top: ${resolveName(ranking[0].pacienteId, nameMaps?.pacientes, 'Paciente')} (${ranking[0].totalCitas} citas)` : 'Sin citas en el período',
    },
    chartOptions: {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', name: 'Citas' },
      yAxis: {
        type: 'category',
        data: ranking.map((r) => resolveName(r.pacienteId, nameMaps?.pacientes, 'Paciente')),
      },
      series: [
        {
          name: 'Total Citas',
          type: 'bar',
          data: ranking.map((r) => r.totalCitas),
        },
        {
          name: 'Completadas',
          type: 'bar',
          data: ranking.map((r) => r.completadas),
        },
      ],
    },
    table: {
      columns: [
        { key: 'paciente', label: 'Paciente' },
        { key: 'totalCitas', label: 'Total Citas' },
        { key: 'completadas', label: 'Completadas' },
      ],
      rows: ranking.map((r) => ({
        pacienteId: r.pacienteId,
        paciente: resolveName(r.pacienteId, nameMaps?.pacientes, 'Paciente'),
        totalCitas: r.totalCitas,
        completadas: r.completadas,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Servicios más solicitados
// ---------------------------------------------------------------------------
export function buildServiciosView(data: KpisFinancieros): KpiViewResult {
  const items = data.serviciosMasSolicitados ?? [];
  return {
    kpiId: 'servicios',
    headline: {
      primary: `${items.length} servicios facturados`,
      secondary: items.length > 0 ? `Top: ${items[0].nombre} (${items[0].cantidad})` : 'Sin servicios facturados',
    },
    chartOptions: {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: items.map((i) => i.nombre) },
      yAxis: { type: 'value', name: 'Cantidad' },
      series: [
        {
          name: 'Cantidad',
          type: 'bar',
          data: items.map((i) => i.cantidad),
        },
      ],
    },
    table: {
      columns: [
        { key: 'nombre', label: 'Servicio' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'montoBs', label: 'Total Facturado (Bs)' },
      ],
      rows: items.map((i) => ({
        servicioId: i.servicioId,
        nombre: i.nombre,
        cantidad: i.cantidad,
        montoBs: i.montoBs,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Tasa de inasistencia (%)
// ---------------------------------------------------------------------------
export function buildInasistenciaView(data: KpisAgenda, nameMaps?: NameMaps): KpiViewResult {
  const inas = data.inasistencia;
  const detalle = inas.detalle ?? [];
  const evaluadas = inas.citasEvaluadas;
  const noAsistio = inas.noAsistio;
  const asistio = Math.max(0, evaluadas - noAsistio);

  return {
    kpiId: 'inasistencia',
    headline: {
      primary: `${inas.porcentaje.toFixed(2).replace(/\.?0+$/, '')}%`,
      secondary: `${noAsistio} inasistencias de ${evaluadas} citas evaluadas`,
      unit: '%',
    },
    chartOptions: {
      tooltip: { trigger: 'item' },
      series: [
        {
          name: 'Inasistencia',
          type: 'pie',
          radius: '60%',
          data: evaluadas > 0 ? [
            { name: 'Completada / Asistió', value: asistio },
            { name: 'No Asistió', value: noAsistio },
          ] : [],
        },
      ],
    },
    table: {
      columns: [
        { key: 'fechaHora', label: 'Fecha y Hora' },
        { key: 'paciente', label: 'Paciente' },
        { key: 'odontologo', label: 'Odontólogo' },
      ],
      rows: detalle.map((d) => ({
        citaId: d.citaId,
        fechaHora: d.fechaHora,
        paciente: resolveName(d.pacienteId, nameMaps?.pacientes, 'Paciente'),
        odontologo: resolveName(d.odontologoId, nameMaps?.odontologos, 'Odontólogo'),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// 6. Horarios pico
// ---------------------------------------------------------------------------
export function buildHorariosPicoView(data: KpisAgenda): KpiViewResult {
  const top = data.horariosPico.top ?? [];
  return {
    kpiId: 'horarios-pico',
    headline: {
      primary: top.length > 0
        ? `${formatWeekday(top[0].diaSemana)} ${String(top[0].hora).padStart(2, '0')}:00 (${top[0].citas} citas)`
        : 'Sin citas registradas',
      secondary: `${top.length} franjas horarias destacadas`,
    },
    chartOptions: {
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: top.map((t) => `${formatWeekday(t.diaSemana)} ${String(t.hora).padStart(2, '0')}:00`),
      },
      yAxis: { type: 'value', name: 'Citas' },
      series: [
        {
          name: 'Citas',
          type: 'bar',
          data: top.map((t) => t.citas),
        },
      ],
    },
    table: {
      columns: [
        { key: 'dia', label: 'Día' },
        { key: 'hora', label: 'Hora' },
        { key: 'citas', label: 'Citas' },
      ],
      rows: top.map((t) => ({
        dia: formatWeekday(t.diaSemana),
        hora: `${String(t.hora).padStart(2, '0')}:00`,
        citas: t.citas,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// 7. Insumos críticos (bajo mínimo y mayor rotación)
// ---------------------------------------------------------------------------
export function buildInsumosCriticosView(data: KpisAgenda): KpiViewResult {
  const items = data.insumosCriticos ?? [];
  const bajoMinimoCount = items.filter((i) => i.bajoMinimo).length;

  return {
    kpiId: 'insumos-criticos',
    headline: {
      primary: `${bajoMinimoCount} bajo mínimo`,
      secondary: `${items.length} insumos monitoreados`,
    },
    chartOptions: {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: items.map((i) => i.nombre) },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'Stock Actual',
          type: 'bar',
          data: items.map((i) => i.stockActual),
        },
        {
          name: 'Salidas del Período',
          type: 'bar',
          data: items.map((i) => i.salidasPeriodo),
        },
      ],
    },
    table: {
      columns: [
        { key: 'nombre', label: 'Insumo' },
        { key: 'stockActual', label: 'Stock Actual' },
        { key: 'stockMinimo', label: 'Stock Mínimo' },
        { key: 'bajoMinimo', label: 'Bajo Mínimo' },
        { key: 'salidasPeriodo', label: 'Salidas del Período' },
      ],
      rows: items.map((i) => ({
        insumoId: i.insumoId,
        nombre: i.nombre,
        stockActual: i.stockActual,
        stockMinimo: i.stockMinimo,
        bajoMinimo: i.bajoMinimo,
        salidasPeriodo: i.salidasPeriodo,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// 8. Flujo de caja neto (ingresos − egresos)
// ---------------------------------------------------------------------------
export function buildFlujoCajaView(data: KpisFinancieros): KpiViewResult {
  const serie = data.flujoCaja.seriePorDia ?? [];
  return {
    kpiId: 'flujo-caja',
    headline: {
      primary: `Bs ${formatBs(data.flujoCaja.saldoNetoBs)}`,
      secondary: `Ingresos: Bs ${formatBs(data.flujoCaja.totalIngresosBs)} | Egresos: Bs ${formatBs(data.flujoCaja.totalEgresosBs)}`,
      unit: 'Bs',
    },
    chartOptions: {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: serie.map((s) => s.fecha) },
      yAxis: { type: 'value', name: 'Bs' },
      series: [
        {
          name: 'Ingresos (Bs)',
          type: 'line',
          data: serie.map((s) => s.ingresosBs),
        },
        {
          name: 'Egresos (Bs)',
          type: 'line',
          data: serie.map((s) => s.egresosBs),
        },
        {
          name: 'Saldo Neto (Bs)',
          type: 'line',
          data: serie.map((s) => s.saldoBs),
        },
      ],
    },
    table: {
      columns: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'ingresosBs', label: 'Ingresos (Bs)' },
        { key: 'egresosBs', label: 'Egresos (Bs)' },
        { key: 'saldoBs', label: 'Saldo (Bs)' },
      ],
      rows: serie.map((s) => ({
        fecha: s.fecha,
        ingresosBs: s.ingresosBs,
        egresosBs: s.egresosBs,
        saldoBs: s.saldoBs,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// 9. Cobranza por método (efectivo vs QR)
// ---------------------------------------------------------------------------
export function buildCobranzaMetodoView(data: KpisFinancieros): KpiViewResult {
  const items = data.cobranzaPorMetodo ?? [];
  return {
    kpiId: 'cobranza-metodo',
    headline: {
      primary: items.length > 0 ? 'Cobranzas por método' : 'Sin cobranzas',
      secondary: `${items.reduce((acc, c) => acc + c.cantidad, 0)} pagos recibidos`,
    },
    chartOptions: {
      tooltip: { trigger: 'item' },
      series: [
        {
          name: 'Cobranza por Método',
          type: 'pie',
          radius: '60%',
          data: items.map((c) => ({
            name: c.metodoPago,
            value: c.montoBs,
          })),
        },
      ],
    },
    table: {
      columns: [
        { key: 'metodoPago', label: 'Método de Pago' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'montoBs', label: 'Monto (Bs)' },
        { key: 'porcentajeMonto', label: '% del Total' },
        { key: 'montoNominal', label: 'Monto Nominal' },
      ],
      rows: items.map((c) => ({
        metodoPago: c.metodoPago,
        cantidad: c.cantidad,
        montoBs: c.montoBs,
        porcentajeMonto: c.porcentajeMonto,
        montoNominal: c.montoNominal,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// 10. Productividad por odontólogo
// ---------------------------------------------------------------------------
export function buildProductividadView(data: KpisAgenda, nameMaps?: NameMaps): KpiViewResult {
  const items = data.productividadOdontologos ?? [];
  return {
    kpiId: 'productividad',
    headline: {
      primary: `${items.length} odontólogos evaluados`,
      secondary: items.length > 0
        ? `Top: ${resolveName(items[0].odontologoId, nameMaps?.odontologos, 'Odontólogo')} (${items[0].tasaCompletadas}%)`
        : 'Sin citas agendadas',
    },
    chartOptions: {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', name: 'Citas' },
      yAxis: {
        type: 'category',
        data: items.map((i) => resolveName(i.odontologoId, nameMaps?.odontologos, 'Odontólogo')),
      },
      series: [
        {
          name: 'Citas Totales',
          type: 'bar',
          data: items.map((i) => i.citasTotales),
        },
        {
          name: 'Citas Completadas',
          type: 'bar',
          data: items.map((i) => i.citasCompletadas),
        },
      ],
    },
    table: {
      columns: [
        { key: 'odontologo', label: 'Odontólogo' },
        { key: 'citasTotales', label: 'Citas Totales' },
        { key: 'citasCompletadas', label: 'Citas Completadas' },
        { key: 'tasaCompletadas', label: 'Tasa Completadas (%)' },
      ],
      rows: items.map((i) => ({
        odontologoId: i.odontologoId,
        odontologo: resolveName(i.odontologoId, nameMaps?.odontologos, 'Odontólogo'),
        citasTotales: i.citasTotales,
        citasCompletadas: i.citasCompletadas,
        tasaCompletadas: i.tasaCompletadas,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
export function buildKpiView(
  kpiId: KpiId,
  data: KpisFinancieros | KpisAgenda,
  nameMaps?: NameMaps,
): KpiViewResult {
  switch (kpiId) {
    case 'ingresos':
      return buildIngresosView(data as KpisFinancieros);
    case 'morosidad':
      return buildMorosidadView(data as KpisFinancieros, nameMaps);
    case 'pacientes-frecuentes':
      return buildPacientesFrecuentesView(data as KpisAgenda, nameMaps);
    case 'servicios':
      return buildServiciosView(data as KpisFinancieros);
    case 'inasistencia':
      return buildInasistenciaView(data as KpisAgenda, nameMaps);
    case 'horarios-pico':
      return buildHorariosPicoView(data as KpisAgenda);
    case 'insumos-criticos':
      return buildInsumosCriticosView(data as KpisAgenda);
    case 'flujo-caja':
      return buildFlujoCajaView(data as KpisFinancieros);
    case 'cobranza-metodo':
      return buildCobranzaMetodoView(data as KpisFinancieros);
    case 'productividad':
      return buildProductividadView(data as KpisAgenda, nameMaps);
    default:
      throw new Error(`KPI desconocido: ${kpiId}`);
  }
}
