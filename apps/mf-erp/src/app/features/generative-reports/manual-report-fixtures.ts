import type { ReporteGenerativoPayload } from '../../core/graphql/models';
import type { EntidadReporte } from './manual-reports.graphql';

export const MOCK_ENTIDADES: EntidadReporte[] = [
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
  {
    clave: 'cuotas',
    nombre: 'Planes de Pago y Cuotas',
    origen: 'ms1',
    columnas: [
      { clave: 'id', etiqueta: 'ID Cuota', tipo: 'TEXTO' },
      { clave: 'monto', etiqueta: 'Monto', tipo: 'MONEDA_BS' },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'TEXTO' },
    ],
    filtrosEstado: ['PENDIENTE', 'PAGADA', 'VENCIDA'],
    filtroFecha: true,
  },
  {
    clave: 'pagos',
    nombre: 'Pagos y Recibos',
    origen: 'ms1',
    columnas: [
      { clave: 'id', etiqueta: 'ID Pago', tipo: 'TEXTO' },
      { clave: 'monto', etiqueta: 'Monto', tipo: 'MONEDA_BS' },
      { clave: 'metodo', etiqueta: 'Método de Pago', tipo: 'TEXTO' },
      { clave: 'fecha', etiqueta: 'Fecha', tipo: 'FECHA_HORA' },
    ],
    filtrosEstado: [],
    filtroFecha: true,
  },
  {
    clave: 'egresos',
    nombre: 'Egresos de Caja Chica',
    origen: 'ms1',
    columnas: [
      { clave: 'id', etiqueta: 'ID Egreso', tipo: 'TEXTO' },
      { clave: 'concepto', etiqueta: 'Concepto', tipo: 'TEXTO' },
      { clave: 'monto', etiqueta: 'Monto', tipo: 'MONEDA_BS' },
      { clave: 'fecha', etiqueta: 'Fecha', tipo: 'FECHA_HORA' },
    ],
    filtrosEstado: [],
    filtroFecha: true,
  },
  {
    clave: 'servicios',
    nombre: 'Catálogo de Servicios (Arancel)',
    origen: 'ms1',
    columnas: [
      { clave: 'id', etiqueta: 'ID Servicio', tipo: 'TEXTO' },
      { clave: 'nombre', etiqueta: 'Servicio', tipo: 'TEXTO' },
      { clave: 'precio', etiqueta: 'Precio Base', tipo: 'MONEDA_BS' },
    ],
    filtrosEstado: [],
    filtroFecha: false,
  },
  {
    clave: 'insumos',
    nombre: 'Inventario / Stock de Insumos',
    origen: 'ms3',
    columnas: [
      { clave: 'insumoId', etiqueta: 'ID Insumo', tipo: 'TEXTO' },
      { clave: 'nombre', etiqueta: 'Nombre Insumo', tipo: 'TEXTO' },
      { clave: 'stockActual', etiqueta: 'Stock Actual', tipo: 'NUMERO' },
      { clave: 'stockMinimo', etiqueta: 'Stock Mínimo', tipo: 'NUMERO' },
      { clave: 'bajoMinimo', etiqueta: 'Bajo Mínimo', tipo: 'BOOLEANO' },
    ],
    filtrosEstado: [],
    filtroFecha: false,
  },
];

export function createMockReport(overrides: Partial<ReporteGenerativoPayload> = {}): ReporteGenerativoPayload {
  return {
    reporteId: '00000000-0000-0000-0000-000000000001',
    consultaSqlEjecutada: 'SELECT id_cita, nombre_paciente FROM citas LIMIT 500',
    sqlGenerado: 'SELECT id_cita, nombre_paciente FROM citas',
    titulo: 'Reporte Manual de Reservas / Citas',
    resumenAnalitico: 'Reporte generado manualmente con 2 registros.',
    columnas: ['ID Cita', 'Nombre Paciente'],
    filas: [
      ['CITA-001', 'Juan Perez'],
      ['CITA-002', 'Maria Lopez'],
    ],
    filasJson: JSON.stringify([
      { 'ID Cita': 'CITA-001', 'Nombre Paciente': 'Juan Perez' },
      { 'ID Cita': 'CITA-002', 'Nombre Paciente': 'Maria Lopez' },
    ]),
    tipoGraficoSugerido: 'TABLA',
    urlDescargaExcel: '/api/v1/reports/export/00000000-0000-0000-0000-000000000001/xlsx',
    urlDescargaPdf: '/api/v1/reports/export/00000000-0000-0000-0000-000000000001/pdf',
    filasTruncadas: false,
    ...overrides,
  };
}
