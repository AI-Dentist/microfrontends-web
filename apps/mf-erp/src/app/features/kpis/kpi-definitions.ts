/**
 * Canonical KPI definitions conforming to specs S1, S2, and S7.
 * Stable route IDs and titles matching S1 verbatim.
 */

export type KpiId =
  | 'ingresos'
  | 'morosidad'
  | 'pacientes-frecuentes'
  | 'servicios'
  | 'inasistencia'
  | 'horarios-pico'
  | 'insumos-criticos'
  | 'flujo-caja'
  | 'cobranza-metodo'
  | 'productividad';

export type KpiSource = 'ms1' | 'ms3';

export interface KpiDefinition {
  id: KpiId;
  order: number;
  title: string;
  source: KpiSource;
  qrNote?: boolean;
  note?: string;
  description: string;
}

export const QR_PAGOFACIL_NOTE =
  'Los montos con QR (QR_PAGOFACIL) corresponden al monto nominal de la cuota, dado que el demo de PagoFácil realiza cobros por 1/1000 del valor.';

export const INASISTENCIA_OBSERVADA_NOTE =
  'Es lo observado, no la predicción del modelo.';

export const KPI_DEFINITIONS: readonly KpiDefinition[] = [
  {
    id: 'ingresos',
    order: 1,
    title: 'Ingresos del período (Bs)',
    source: 'ms1',
    qrNote: true,
    description: 'Movimientos de caja de tipo INGRESO registrados en el período.',
  },
  {
    id: 'morosidad',
    order: 2,
    title: 'Morosidad: cuotas vencidas (% y Bs)',
    source: 'ms1',
    description: 'Cuotas exigibles pendientes cuya fecha de vencimiento ya pasó.',
  },
  {
    id: 'pacientes-frecuentes',
    order: 3,
    title: 'Pacientes más frecuentes (ranking)',
    source: 'ms3',
    description: 'Ranking de pacientes con mayor número de citas en el período.',
  },
  {
    id: 'servicios',
    order: 4,
    title: 'Servicios más solicitados',
    source: 'ms1',
    description: 'Servicios odontológicos facturados en órdenes de cobro del período.',
  },
  {
    id: 'inasistencia',
    order: 5,
    title: 'Tasa de inasistencia (%)',
    source: 'ms3',
    note: INASISTENCIA_OBSERVADA_NOTE,
    description: 'Porcentaje de citas con inasistencia (NO_ASISTIO) sobre citas evaluadas.',
  },
  {
    id: 'horarios-pico',
    order: 6,
    title: 'Horarios pico',
    source: 'ms3',
    description: 'Distribución y concentración de citas por día de la semana y franja horaria.',
  },
  {
    id: 'insumos-criticos',
    order: 7,
    title: 'Insumos críticos (bajo mínimo y mayor rotación)',
    source: 'ms3',
    description: 'Insumos con existencia bajo el stock mínimo o mayor rotación en el período.',
  },
  {
    id: 'flujo-caja',
    order: 8,
    title: 'Flujo de caja neto (ingresos \u2212 egresos)',
    source: 'ms1',
    description: 'Totales de ingresos, egresos y saldo neto operativo de caja.',
  },
  {
    id: 'cobranza-metodo',
    order: 9,
    title: 'Cobranza por método (efectivo vs QR)',
    source: 'ms1',
    qrNote: true,
    description: 'Cobranzas agrupadas por método de pago (efectivo, QR PagoFácil, transferencia).',
  },
  {
    id: 'productividad',
    order: 10,
    title: 'Productividad por odontólogo',
    source: 'ms3',
    description: 'Total de citas y porcentaje de citas completadas por cada odontólogo.',
  },
];

const KPI_INDEX = new Map<string, KpiDefinition>(
  KPI_DEFINITIONS.map((def) => [def.id, def]),
);

export function getKpiDefinition(id: string): KpiDefinition | undefined {
  return KPI_INDEX.get(id);
}
