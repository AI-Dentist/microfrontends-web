import { buildChartOptions, detectNumericColumns, parseReportRows, resolveDownloadUrl } from './report-data';

describe('parseReportRows', () => {
  const columns = ['metodo', 'total'];

  it('maps object rows by column name', () => {
    const result = parseReportRows(columns, '[{"total": 10, "metodo": "QR"}, {"metodo": "EFECTIVO"}]');
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([
      ['QR', 10],
      ['EFECTIVO', null],
    ]);
  });

  it('keeps array rows positionally ordered and pads short rows', () => {
    const result = parseReportRows(columns, '[["QR", 10], ["EFECTIVO"]]');
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([
      ['QR', 10],
      ['EFECTIVO', null],
    ]);
  });

  it('returns an error and no rows for invalid JSON', () => {
    const result = parseReportRows(columns, '{not json');
    expect(result.rows).toEqual([]);
    expect(result.error).toBe('No se pudo interpretar los datos del reporte.');
  });

  it('returns an error when the JSON is not an array', () => {
    const result = parseReportRows(columns, '{"a": 1}');
    expect(result.rows).toEqual([]);
    expect(result.error).not.toBeNull();
  });

  it('treats empty or missing input as no rows without error', () => {
    expect(parseReportRows(columns, '')).toEqual({ rows: [], error: null });
    expect(parseReportRows(columns, '[]')).toEqual({ rows: [], error: null });
  });
});

describe('detectNumericColumns', () => {
  it('detects numeric values, numeric strings and ignores the category column', () => {
    const rows = [
      ['QR', '1250.50', 'a', 3],
      ['EFECTIVO', '300', 'b', null],
    ];
    expect(detectNumericColumns(['metodo', 'monto', 'texto', 'n'], rows)).toEqual([1, 3]);
  });

  it('never treats the first column as numeric and rejects empty columns', () => {
    expect(detectNumericColumns(['a', 'b'], [[1, null]])).toEqual([]);
  });
});

describe('buildChartOptions', () => {
  const columns = ['metodo', 'total', 'cantidad'];
  const rows = [
    ['QR', '100', 2],
    ['EFECTIVO', 50, 1],
  ];

  it('builds a bar chart with one series per numeric column', () => {
    const options = buildChartOptions('BARRAS', columns, rows) as any;
    expect(options.xAxis.data).toEqual(['QR', 'EFECTIVO']);
    expect(options.tooltip.renderMode).toBe('richText');
    expect(options.series.map((s: any) => s.type)).toEqual(['bar', 'bar']);
    expect(options.series[0]).toMatchObject({ name: 'total', data: [100, 50] });
    expect(options.series[1]).toMatchObject({ name: 'cantidad', data: [2, 1] });
  });

  it('builds a line chart', () => {
    const options = buildChartOptions('LINEAS', columns, rows) as any;
    expect(options.tooltip.renderMode).toBe('richText');
    expect(options.series.map((s: any) => s.type)).toEqual(['line', 'line']);
    expect(options.xAxis.data).toEqual(['QR', 'EFECTIVO']);
  });

  it('builds a pie chart from the first numeric column only', () => {
    const options = buildChartOptions('TORTA', columns, rows) as any;
    expect(options.tooltip.renderMode).toBe('richText');
    expect(options.series).toHaveLength(1);
    expect(options.series[0].type).toBe('pie');
    expect(options.series[0].data).toEqual([
      { name: 'QR', value: 100 },
      { name: 'EFECTIVO', value: 50 },
    ]);
  });

  it('keeps TABLA responses table-only', () => {
    expect(buildChartOptions('TABLA', columns, rows)).toBeNull();
  });

  it('does not invent a bar chart for an unknown backend suggestion', () => {
    expect(buildChartOptions('DESCONOCIDO', columns, rows)).toBeNull();
  });

  it('returns null when there is no chart type, no rows or no numeric column', () => {
    expect(buildChartOptions(null, columns, rows)).toBeNull();
    expect(buildChartOptions('BARRAS', columns, [])).toBeNull();
    expect(buildChartOptions('BARRAS', ['a', 'b'], [['x', 'y']])).toBeNull();
  });
});

describe('resolveDownloadUrl', () => {
  it('resolves relative URLs against the GraphQL origin', () => {
    expect(resolveDownloadUrl('/api/v1/reportes/1.xlsx', 'http://localhost:8080/graphql', 'http://localhost:4201')).toBe(
      'http://localhost:8080/api/v1/reportes/1.xlsx',
    );
    expect(resolveDownloadUrl('/files/a.pdf', '/graphql', 'https://erp.example.com')).toBe('https://erp.example.com/files/a.pdf');
  });

  // Whether auth headers may be sent there is decided by isTrustedApiUrl (core/graphql/request-headers).
  it('keeps absolute URLs untouched', () => {
    expect(resolveDownloadUrl('https://cdn.example.com/a.pdf', 'http://localhost:8080/graphql', 'http://localhost:4201')).toBe(
      'https://cdn.example.com/a.pdf',
    );
  });
});
