import { Directive, input } from '@angular/core';
import { By } from '@angular/platform-browser';
import { NgxEchartsDirective } from 'ngx-echarts';
import { TestBed } from '@angular/core/testing';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { ReportExportService } from './report-export.service';
import { DynamicReportViewer } from './dynamic-report-viewer.component';

@Directive({ selector: '[echarts]' })
class ChartFixture { readonly options = input<any>(); }

it('renders canonical title summary and matrix rows, and switches all chart types without mutating the report', async () => {
  await TestBed.configureTestingModule({ imports: [DynamicReportViewer], providers: [
    { provide: AuthContextService, useValue: { roles: () => ['ADMIN'] } },
    { provide: ReportExportService, useValue: { download: vi.fn() } },
  ] }).overrideComponent(DynamicReportViewer, { remove: { imports: [NgxEchartsDirective] }, add: { imports: [ChartFixture] } }).compileComponents();
  // Avoid canvas initialization: inspect the computed ECharts public directive options after each DOM event.
  const fixture = TestBed.createComponent(DynamicReportViewer);
  const report = { reporteId: 'id', titulo: 'Ingresos Bs', resumenAnalitico: 'El efectivo lidera.',
    consultaSqlEjecutada: 'SELECT total', sqlGenerado: 'SELECT total', columnas: ['metodo', 'Bs'],
    filas: [['EFECTIVO', '120']], filasJson: '[]', tipoGraficoSugerido: 'BARRAS', urlDescargaExcel: '', urlDescargaPdf: '' };
  fixture.componentRef.setInput('report', report);
  await fixture.whenStable();
  expect(fixture.nativeElement.textContent).toContain('Ingresos Bs');
  expect(fixture.nativeElement.textContent).toContain('El efectivo lidera.');
  expect(fixture.nativeElement.querySelector('p-table').textContent).toContain('120');
  const select: HTMLSelectElement = fixture.nativeElement.querySelector('select[aria-label="Tipo de gráfico"]');
  expect(select).not.toBeNull();
  for (const value of ['TORTA', 'LINEAS', 'BARRAS']) {
    select.value = value; select.dispatchEvent(new Event('change')); await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(ChartFixture)).injector.get(ChartFixture).options().series[0].type).toBe(value === 'TORTA' ? 'pie' : value === 'LINEAS' ? 'line' : 'bar');
  }
  expect(report.tipoGraficoSugerido).toBe('BARRAS');
  fixture.destroy();
});
