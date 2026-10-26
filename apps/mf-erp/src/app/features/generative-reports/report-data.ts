import type { EChartsCoreOption } from 'echarts/core';
import type { TipoGrafico } from '../../core/graphql/models';

export type CellValue = string | number | boolean | null;

export interface ParsedReportRows {
  rows: CellValue[][];
  error: string | null;
}

export const REPORT_PARSE_ERROR = 'No se pudo interpretar los datos del reporte.';

function toCell(value: unknown): CellValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}

/** Converts the `filasJson` string (objects keyed by column or positional arrays) into a rows matrix. */
export function parseReportRows(columns: string[], filasJson: string | null | undefined): ParsedReportRows {
  if (!filasJson?.trim()) {
    return { rows: [], error: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(filasJson);
  } catch {
    return { rows: [], error: REPORT_PARSE_ERROR };
  }
  if (!Array.isArray(parsed)) {
    return { rows: [], error: REPORT_PARSE_ERROR };
  }
  const rows = parsed.map((row): CellValue[] => {
    if (Array.isArray(row)) {
      return columns.map((_, index) => toCell(row[index]));
    }
    if (row && typeof row === 'object') {
      const record = row as Record<string, unknown>;
      return columns.map((column) => toCell(record[column]));
    }
    return columns.map((_, index) => (index === 0 ? toCell(row) : null));
  });
  return { rows, error: null };
}

/** Parses numbers and numeric strings; anything else is NaN. */
export function toNumber(value: CellValue): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return Number.NaN;
}

/** Indexes of numeric columns, skipping the first (category) column. Nulls are ignored; a column needs one number. */
export function detectNumericColumns(columns: string[], rows: CellValue[][]): number[] {
  const numeric: number[] = [];
  for (let index = 1; index < columns.length; index++) {
    const values = rows.map((row) => row[index] ?? null).filter((value) => value !== null);
    if (values.length > 0 && values.every((value) => Number.isFinite(toNumber(value)))) {
      numeric.push(index);
    }
  }
  return numeric;
}

/** Builds ECharts options: first column = category, numeric columns = series (pie: first numeric only). */
export function buildChartOptions(
  type: TipoGrafico | null | undefined,
  columns: string[],
  rows: CellValue[][],
): EChartsCoreOption | null {
  if (!type || !['BARRAS', 'LINEAS', 'TORTA'].includes(type) || rows.length === 0) {
    return null;
  }
  const numericColumns = detectNumericColumns(columns, rows);
  if (numericColumns.length === 0) {
    return null;
  }
  const categories = rows.map((row) => String(row[0] ?? ''));
  const valueOf = (row: CellValue[], column: number) => {
    const value = toNumber(row[column] ?? null);
    return Number.isFinite(value) ? value : 0;
  };

  if (type === 'TORTA') {
    const column = numericColumns[0];
    return {
      tooltip: { trigger: 'item', renderMode: 'richText' },
      legend: { type: 'scroll', bottom: 0 },
      series: [
        {
          name: columns[column],
          type: 'pie',
          radius: ['35%', '65%'],
          data: rows.map((row, index) => ({ name: categories[index], value: valueOf(row, column) })),
        },
      ],
    };
  }

  const seriesType = type === 'LINEAS' ? 'line' : 'bar';
  return {
    tooltip: { trigger: 'axis', renderMode: 'richText' },
    legend: { top: 0 },
    grid: { left: 40, right: 16, bottom: 32, containLabel: true },
    xAxis: { type: 'category', data: categories },
    yAxis: { type: 'value' },
    series: numericColumns.map((column) => ({
      name: columns[column],
      type: seriesType,
      data: rows.map((row) => valueOf(row, column)),
    })),
  };
}

/** Resolves a download URL; relative ones use the origin of the GraphQL endpoint. */
export function resolveDownloadUrl(url: string, graphqlUrl: string, currentOrigin: string): string {
  const origin = new URL(graphqlUrl, currentOrigin).origin;
  return new URL(url, origin).toString();
}

/** Credentials may travel only to this report's canonical MS1 export route. */
export function trustedReportExportUrl(raw: string, graphqlUrl: string, currentOrigin: string, reportId: string, format: string): string {
  try {
    const backend = new URL(graphqlUrl, currentOrigin);
    const url = new URL(raw, backend.origin);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId) ||
        !['xlsx', 'pdf'].includes(format) || !['http:', 'https:'].includes(url.protocol) ||
        url.origin !== backend.origin || url.username || url.password || url.search || url.hash ||
        url.pathname !== `/api/v1/reports/export/${reportId}/${format}`) throw new Error();
    return url.href;
  } catch { throw new Error('URL de exportación no autorizada.'); }
}
