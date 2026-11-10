import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { ManualReportBuilderComponent } from './manual-report-builder.component';
import { ManualReportService } from './manual-report.service';
import { ReportExportService } from './report-export.service';
import { MOCK_ENTIDADES, createMockReport } from './manual-report-fixtures';

describe('ManualReportBuilderComponent', () => {
  let roleSignal: ReturnType<typeof signal<string[]>>;
  let principalKeySignal: ReturnType<typeof signal<string | null>>;
  let onlineSignal: ReturnType<typeof signal<boolean>>;
  let mockManualReportService: {
    listEntities: ReturnType<typeof vi.fn>;
    preview: ReturnType<typeof vi.fn>;
  };
  let mockExportService: {
    download: ReturnType<typeof vi.fn>;
  };

  async function setup(options: { roles?: string[]; online?: boolean; principal?: string | null } = {}) {
    roleSignal = signal(options.roles ?? ['ADMIN']);
    principalKeySignal = signal(options.principal !== undefined ? options.principal : 'admin-principal');
    onlineSignal = signal(options.online ?? true);

    mockManualReportService = {
      listEntities: vi.fn(async () => MOCK_ENTIDADES),
      preview: vi.fn(async (input) => createMockReport()),
    };

    mockExportService = {
      download: vi.fn(async () => undefined),
    };

    await TestBed.configureTestingModule({
      imports: [ManualReportBuilderComponent],
      providers: [
        {
          provide: AuthContextService,
          useValue: {
            roles: roleSignal,
            principalKey: principalKeySignal,
            refresh: () => principalKeySignal(),
            devUserHeader: () => null,
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
          provide: ReportExportService,
          useValue: mockExportService,
        },
      ],
    })
      .overrideComponent(ManualReportBuilderComponent, {
        set: {
          providers: [{ provide: ManualReportService, useValue: mockManualReportService }],
        },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(ManualReportBuilderComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return { fixture };
  }

  it('displays a notice and does NOT call listEntities if user is not ADMIN', async () => {
    const { fixture } = await setup({ roles: ['RECEPCIONISTA'] });
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Solo ADMIN');
    expect(mockManualReportService.listEntities).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('select[data-testid="entity-select"]')).toBeNull();
  });

  it('displays an offline notice and does NOT call listEntities if offline', async () => {
    const { fixture } = await setup({ online: false });
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Sin conexión');
    expect(mockManualReportService.listEntities).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('select[data-testid="entity-select"]')).toBeNull();
  });

  it('loads and displays all 7 entities in server order', async () => {
    const { fixture } = await setup();
    expect(mockManualReportService.listEntities).toHaveBeenCalledOnce();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    const options = [...select.options].map((o) => o.value).filter(Boolean);
    expect(options).toEqual(MOCK_ENTIDADES.map((e) => e.clave));
  });

  it('renders column checkboxes in server order when entity selected', async () => {
    const { fixture } = await setup();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"][data-column]');
    const renderedColumnKeys = [...checkboxes].map((cb) => cb.getAttribute('data-column'));
    const citasCols = MOCK_ENTIDADES.find((e) => e.clave === 'citas')!.columnas.map((c) => c.clave);
    expect(renderedColumnKeys).toEqual(citasCols);
  });

  it('preserves server metadata column order in preview input even if clicked in reverse order', async () => {
    const { fixture } = await setup();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const cbOdontologo = fixture.nativeElement.querySelector('input[data-column="odontologo"]') as HTMLInputElement;
    const cbIdCita = fixture.nativeElement.querySelector('input[data-column="id_cita"]') as HTMLInputElement;

    // Click in reverse order: odontologo first, then id_cita
    cbOdontologo.click();
    fixture.detectChanges();
    cbIdCita.click();
    fixture.detectChanges();

    const previewBtn = fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement;
    previewBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockManualReportService.preview).toHaveBeenCalledWith({
      entidad: 'citas',
      columnas: ['id_cita', 'odontologo'],
    });
  });

  it('shows status filter only for entities with nonempty filtrosEstado', async () => {
    const { fixture } = await setup();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;

    // 'citas' has filtrosEstado
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="status-select"]')).not.toBeNull();

    // 'pacientes' has empty filtrosEstado
    select.value = 'pacientes';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="status-select"]')).toBeNull();
  });

  it('shows date controls only for entities with filtroFecha === true', async () => {
    const { fixture } = await setup();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;

    // 'citas' has filtroFecha: true
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="date-controls"]')).not.toBeNull();

    // 'pacientes' has filtroFecha: false
    select.value = 'pacientes';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="date-controls"]')).toBeNull();
  });

  it('switching entity resets columns, filters, and preview', async () => {
    const { fixture } = await setup();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;

    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const cb = fixture.nativeElement.querySelector('input[data-column="id_cita"]') as HTMLInputElement;
    cb.click();
    fixture.detectChanges();

    const previewBtn = fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement;
    previewBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="preview-table"]')).not.toBeNull();

    // Switch entity to 'pacientes'
    select.value = 'pacientes';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // Preview table and previous columns should be cleared
    expect(fixture.nativeElement.querySelector('[data-testid="preview-table"]')).toBeNull();
    const checked = fixture.nativeElement.querySelectorAll('input[type="checkbox"]:checked');
    expect(checked.length).toBe(0);
  });

  it('displays S1 QR nominal note when "pagos" entity is selected', async () => {
    const { fixture } = await setup();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'pagos';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const note = fixture.nativeElement.querySelector('[data-testid="qr-nominal-note"]');
    expect(note).not.toBeNull();
    expect(note.textContent).toContain('/1000');
  });

  it('validates empty columns and blocks preview', async () => {
    const { fixture } = await setup();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const previewBtn = fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement;
    previewBtn.click();
    fixture.detectChanges();

    expect(mockManualReportService.preview).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Debe seleccionar al menos una columna');
  });

  it('validates invalid date range (start after end or > 366 days)', async () => {
    const { fixture } = await setup();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const cb = fixture.nativeElement.querySelector('input[data-column="id_cita"]') as HTMLInputElement;
    cb.click();
    fixture.detectChanges();

    const startInput = fixture.nativeElement.querySelector('input[data-testid="fecha-inicio"]') as HTMLInputElement;
    const endInput = fixture.nativeElement.querySelector('input[data-testid="fecha-fin"]') as HTMLInputElement;

    // Start after end
    startInput.value = '2026-05-10';
    startInput.dispatchEvent(new Event('input'));
    endInput.value = '2026-05-01';
    endInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const previewBtn = fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement;
    previewBtn.click();
    fixture.detectChanges();

    expect(mockManualReportService.preview).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('fecha de inicio no puede ser posterior');
  });

  it('renders returned report table with headers and data cells', async () => {
    const { fixture } = await setup();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('input[data-column="id_cita"]') as HTMLInputElement).click();
    (fixture.nativeElement.querySelector('input[data-column="nombre_paciente"]') as HTMLInputElement).click();
    fixture.detectChanges();

    const previewBtn = fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement;
    previewBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const ths = [...fixture.nativeElement.querySelectorAll('th')].map((th) => th.textContent?.trim());
    expect(ths).toEqual(['ID Cita', 'Nombre Paciente']);

    const tds = [...fixture.nativeElement.querySelectorAll('tbody td')].map((td) => td.textContent?.trim());
    expect(tds).toContain('CITA-001');
    expect(tds).toContain('Juan Perez');
  });

  it('renders empty-state notice when report rows are empty', async () => {
    const { fixture } = await setup();
    mockManualReportService.preview.mockResolvedValueOnce(
      createMockReport({
        filas: [],
        filasJson: '[]',
      }),
    );

    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('input[data-column="id_cita"]') as HTMLInputElement).click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sin resultados');
  });

  it('renders 500-row cap notice when filasTruncadas is true, and no notice when false/null', async () => {
    const { fixture } = await setup();
    mockManualReportService.preview.mockResolvedValueOnce(
      createMockReport({
        filasTruncadas: true,
      }),
    );

    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('input[data-column="id_cita"]') as HTMLInputElement).click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const capNotice = fixture.nativeElement.querySelector('[data-testid="truncated-cap-notice"]');
    expect(capNotice).not.toBeNull();
    expect(capNotice.textContent).toContain('500');

    // Next preview without truncation
    mockManualReportService.preview.mockResolvedValueOnce(
      createMockReport({
        filasTruncadas: false,
      }),
    );
    (fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="truncated-cap-notice"]')).toBeNull();
  });

  it('delegates to ReportExportService.download with exact accessible button labels', async () => {
    const { fixture } = await setup();
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('input[data-column="id_cita"]') as HTMLInputElement).click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const pdfBtn = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Exportar PDF' || b.getAttribute('aria-label') === 'Exportar PDF',
    ) as HTMLButtonElement;
    const xlsxBtn = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Exportar Excel (.xlsx)' || b.getAttribute('aria-label') === 'Exportar Excel (.xlsx)',
    ) as HTMLButtonElement;

    expect(pdfBtn).toBeTruthy();
    expect(xlsxBtn).toBeTruthy();

    pdfBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mockExportService.download).toHaveBeenCalledWith(expect.anything(), 'pdf');

    xlsxBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mockExportService.download).toHaveBeenCalledWith(expect.anything(), 'xlsx');
  });

  it('handles preview error without displaying a fake report', async () => {
    const { fixture } = await setup();
    mockManualReportService.preview.mockRejectedValueOnce(new Error('Servicio no disponible'));

    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('input[data-column="id_cita"]') as HTMLInputElement).click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Servicio no disponible');
    expect(fixture.nativeElement.querySelector('[data-testid="preview-table"]')).toBeNull();
  });

  async function selectCitasColumn(fixture: { nativeElement: HTMLElement; detectChanges(): void }, column = 'id_cita') {
    const select = fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement;
    select.value = 'citas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector(`input[data-column="${column}"]`) as HTMLInputElement).click();
    fixture.detectChanges();
  }

  it('keeps the form and shows the preview when the service refresh republishes the same roles', async () => {
    const { fixture } = await setup();
    // The real AuthContextService.refresh() always republishes claims, so roles() becomes a new, equal array.
    const republish = () => roleSignal.set([...roleSignal()]);
    mockManualReportService.listEntities.mockImplementation(async () => { republish(); return MOCK_ENTIDADES; });
    mockManualReportService.preview.mockImplementation(async () => { republish(); return createMockReport(); });
    const listCalls = mockManualReportService.listEntities.mock.calls.length;

    await selectCitasColumn(fixture);
    (fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement).click();
    for (let i = 0; i < 3; i++) { fixture.detectChanges(); await fixture.whenStable(); }

    expect(fixture.nativeElement.querySelector('[data-testid="preview-table"]')).not.toBeNull();
    expect((fixture.nativeElement.querySelector('select[data-testid="entity-select"]') as HTMLSelectElement).value).toBe('citas');
    expect(mockManualReportService.listEntities.mock.calls.length).toBe(listCalls);
  });

  it('reads connectivity from the online signal without writing signals during rendering', async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args); });
    const { fixture } = await setup();
    // Like the real service, isOnline() resyncs (writes) the signal; rendering must not call it.
    const network = TestBed.inject(NetworkStatusService) as unknown as { isOnline: () => boolean };
    network.isOnline = () => { onlineSignal.set(!onlineSignal()); return onlineSignal(); };
    onlineSignal.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin conexión');
    onlineSignal.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select[data-testid="entity-select"]')).not.toBeNull();
    spy.mockRestore();
    expect(errors).toEqual([]);
  });

  it('discards a preview response for parameters edited while it was in flight', async () => {
    const { fixture } = await setup();
    let resolve!: (report: ReturnType<typeof createMockReport>) => void;
    mockManualReportService.preview.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));

    await selectCitasColumn(fixture);
    (fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('input[data-column="odontologo"]') as HTMLInputElement).click();
    fixture.detectChanges();

    resolve(createMockReport());
    for (let i = 0; i < 3; i++) { fixture.detectChanges(); await fixture.whenStable(); }

    expect(fixture.nativeElement.querySelector('[data-testid="preview-table"]')).toBeNull();
    expect((fixture.nativeElement.querySelector('button[data-testid="preview-button"]') as HTMLButtonElement).disabled).toBe(false);
  });
});
