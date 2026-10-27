import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, Subject, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { LISTAR_PACIENTES, OBTENER_PACIENTE_POR_ID } from '../../core/graphql/queries.graphql';
import { ACTUALIZAR_PACIENTE } from '../../core/graphql/mutations.graphql';
import { IDEMPOTENCY_CONTEXT_KEY, OWNER_CONTEXT_KEY } from '../../core/graphql/graphql.provider';

import { erpLocalDb } from '../../core/offline/dexie.db';
const cache = erpLocalDb().pacientes;
beforeEach(() => {
  vi.spyOn(cache, 'put').mockResolvedValue('p');
  vi.spyOn(cache, 'bulkPut').mockResolvedValue('p');
  vi.spyOn(cache, 'toArray').mockResolvedValue([]);
  vi.spyOn(cache, 'delete').mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { CriticalMutationService } from '../../core/offline/critical-mutation.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { PatientsCatalog } from './patients-catalog.component';

it('creates a patient by clicking the visible dialog footer Save button', async () => {
  const input = { ciNit: '7654321', nombres: 'Luis', apellidos: 'Smoke', telefonoWhatsapp: '71234567', email: null, fechaNacimiento: null, genero: null, direccion: null };
  const run = vi.fn(async () => ({ status: 'completed', data: { crearPaciente: { id: 'p2', ...input } } }));
  await TestBed.configureTestingModule({ imports: [PatientsCatalog], providers: [
    MessageService,
    { provide: AuthContextService, useValue: { roles: () => ['ADMIN'] } },
    { provide: Apollo, useValue: { query: () => of({ data: { listarPacientes: [] } }) } },
    { provide: NetworkStatusService, useValue: { online: () => true, isOnline: () => true } },
    { provide: CriticalMutationService, useValue: { run } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(PatientsCatalog);
  await fixture.whenStable();
  fixture.componentInstance.openCreate();
  fixture.componentInstance.form.patchValue({ ciNit: input.ciNit, nombres: input.nombres, apellidos: input.apellidos, telefonoWhatsapp: input.telefonoWhatsapp });
  await fixture.whenStable();
  const save = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((button) => button.textContent?.trim() === 'Guardar');
  expect(save).toBeDefined();
  save!.click();
  await fixture.whenStable();
  expect(run).toHaveBeenCalledWith('CrearPaciente', { input }, expect.anything());
  // IndexedDB completes outside Angular's stability tracking; await the public UI state.
  await vi.waitFor(() => expect(fixture.componentInstance.patients().some((patient) => patient.ciNit === input.ciNit)).toBe(true));
});

describe('authoritative patient replacement', () => {
  const original = { id: 'p', ciNit: ' 1 ', nombres: ' Ana ', apellidos: ' Rojas ', telefonoWhatsapp: '+591 (7123)-4567', email: '', direccion: null, fechaNacimiento: '2000-02-29', genero: '  otro / libre  ', activo: true };
  const online = signal(true);
  const roles = signal(['ADMIN']);
  let owner = 'owner-a';
  const query = vi.fn();
  const mutate = vi.fn();
  const run = vi.fn();
  const messages = { add: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); online.set(true); roles.set(['ADMIN']); owner = 'owner-a';
    query.mockImplementation(({ query: document }) => of({ data: document === LISTAR_PACIENTES ? { listarPacientes: [original] } : { obtenerPacientePorId: original } }));
    mutate.mockImplementation(({ variables }) => of({ data: { actualizarPaciente: { ...original, ...variables.input } } }));
    TestBed.configureTestingModule({ imports: [PatientsCatalog], providers: [
      { provide: Apollo, useValue: { query, mutate } },
      { provide: AuthContextService, useValue: { roles, refresh: () => null, principalKey: () => owner } },
      { provide: NetworkStatusService, useValue: { online, isOnline: () => online() } },
      { provide: CriticalMutationService, useValue: { run } },
      { provide: MessageService, useValue: messages },
      ConfirmationService,
    ] });
  });
  function screen() { return TestBed.runInInjectionContext(() => new PatientsCatalog()); }
  function noWrite(component: PatientsCatalog) {
    expect(cache.put).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
    expect(component.patients()).toEqual([]);
    expect(messages.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  }

  it('opens the visible edit action, reads detail and resends exact unchanged values before confirmed cache/dialog success', async () => {
    const fixture = TestBed.createComponent(PatientsCatalog);
    await fixture.whenStable();
    await fixture.componentInstance.load();
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button[aria-label="Editar paciente"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false); button.click();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ query: OBTENER_PACIENTE_POR_ID, variables: { id: 'p' }, fetchPolicy: 'network-only' }));
    expect(component.form.getRawValue()).toEqual({ ciNit: ' 1 ', nombres: ' Ana ', apellidos: ' Rojas ', telefonoWhatsapp: '+591 (7123)-4567', email: '', direccion: '', fechaNacimiento: '2000-02-29', genero: '  otro / libre  ' });
    component.form.patchValue({ nombres: ' Beatriz ' });
    const save = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.trim() === 'Guardar');
    expect(save).toBeDefined();
    save!.click();
    await fixture.whenStable();
    const input = { ciNit: original.ciNit, nombres: 'Beatriz', apellidos: original.apellidos, telefonoWhatsapp: original.telefonoWhatsapp, email: '', direccion: null, fechaNacimiento: original.fechaNacimiento, genero: original.genero };
    expect(mutate).toHaveBeenCalledWith({ mutation: ACTUALIZAR_PACIENTE, variables: { id: 'p', input }, fetchPolicy: 'no-cache', context: { [IDEMPOTENCY_CONTEXT_KEY]: expect.any(String), [OWNER_CONTEXT_KEY]: 'owner-a' } });
    expect(cache.put).toHaveBeenCalledExactlyOnceWith({ ...original, ...input });
    expect(component.patients()).toEqual([{ ...original, ...input }]); expect(component.dialogOpen()).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it.each([null, '', '   '])('preserves unchanged nullable gender %j', async genero => {
    const component = screen();
    query.mockReturnValue(of({ data: { obtenerPacientePorId: { ...original, genero, fechaNacimiento: null } } }));
    await component.openEdit(original); await component.save();
    expect(mutate.mock.calls[0][0].variables.input).toEqual({ ciNit: original.ciNit, nombres: original.nombres, apellidos: original.apellidos, telefonoWhatsapp: original.telefonoWhatsapp, email: '', direccion: null, fechaNacimiento: null, genero });
  });

  it('clears changed nullable fields explicitly and validates/normalizes only changed required fields', async () => {
    const component = screen();
    const detail = { ...original, email: 'old@example.bo', direccion: ' Calle ', telefonoWhatsapp: 'legacy-format' };
    query.mockReturnValue(of({ data: { obtenerPacientePorId: detail } }));
    await component.openEdit(original);
    component.form.patchValue({ genero: '', fechaNacimiento: '', email: '', direccion: '' });
    await component.save();
    expect(mutate.mock.lastCall![0].variables.input).toEqual({
      ciNit: detail.ciNit, nombres: detail.nombres, apellidos: detail.apellidos,
      telefonoWhatsapp: 'legacy-format', genero: null, fechaNacimiento: null, email: null, direccion: null,
    });
    await component.openEdit(original);
    component.form.patchValue({ telefonoWhatsapp: '123' });
    mutate.mockClear(); vi.mocked(cache.put).mockClear();
    await component.save();
    expect(component.errors().telefonoWhatsapp).toBe('Ingrese un celular boliviano válido (8 dígitos, inicia con 6 o 7)');
    expect(mutate).not.toHaveBeenCalled(); expect(cache.put).not.toHaveBeenCalled();
    component.form.patchValue({ telefonoWhatsapp: ' 6123-4567 ', genero: ' libre ', fechaNacimiento: '2004-02-29' });
    await component.save();
    expect(mutate.mock.lastCall![0].variables.input).toMatchObject({ telefonoWhatsapp: '61234567', genero: 'libre', fechaNacimiento: '2004-02-29' });
  });

  it('retains national-phone creation and offline queue behavior', async () => {
    online.set(false);
    run.mockResolvedValue({ status: 'queued' });
    const component = screen();
    component.openCreate();
    component.form.patchValue({ ciNit: '1', nombres: 'Ana', apellidos: 'Rojas', telefonoWhatsapp: '71234567' });
    await component.save();
    expect(run).toHaveBeenCalledWith('CrearPaciente', { input: {
      ciNit: '1', nombres: 'Ana', apellidos: 'Rojas', telefonoWhatsapp: '71234567',
      email: null, direccion: null, fechaNacimiento: null, genero: null,
    } }, expect.anything());
    expect(mutate).not.toHaveBeenCalled(); expect(cache.put).not.toHaveBeenCalled();
    expect(component.dialogOpen()).toBe(false);
  });

  it.each(['missing', 'wrong-id', 'bad-type', 'read-error', 'offline', 'unauthorized', 'owner-change', 'role-change', 'cancel', 'create'])('fails closed for %s detail and programmatic edit state', async mode => {
    const component = screen();
    const pending = new Subject<unknown>();
    query.mockReturnValue(pending);
    if (mode === 'offline') online.set(false);
    if (mode === 'unauthorized') roles.set(['CAJERO']);
    const loading = component.openEdit(original);
    if (['offline', 'unauthorized'].includes(mode)) expect(query).not.toHaveBeenCalled();
    else expect(query).toHaveBeenCalled();
    if (mode === 'owner-change') owner = 'owner-b';
    if (mode === 'role-change') roles.set(['CAJERO']);
    if (mode === 'cancel') component.dialogOpen.set(false);
    if (mode === 'create') component.openCreate();
    if (mode === 'read-error') pending.error(new Error('read failed'));
    else {
      const detail = mode === 'missing' ? { ...original, genero: undefined }
        : mode === 'wrong-id' ? { ...original, id: 'other' }
        : mode === 'bad-type' ? { ...original, fechaNacimiento: 123 } : original;
      pending.next({ data: { obtenerPacientePorId: detail } });
      pending.complete();
    }
    await loading;
    component.editing.set(original); await component.save();
    expect(mutate).not.toHaveBeenCalled(); noWrite(component);
  });

  it('ignores an obsolete detail load after a different patient is selected', async () => {
    const component = screen();
    const first = new Subject<unknown>();
    query.mockReturnValueOnce(first);
    const loading = component.openEdit(original);
    const second = { ...original, id: 'p2', nombres: 'Segunda' };
    query.mockReturnValueOnce(of({ data: { obtenerPacientePorId: second } }));
    await component.openEdit(second);
    first.next({ data: { obtenerPacientePorId: original } }); first.complete();
    await loading;
    expect(component.editing()?.id).toBe('p2');
    expect(component.form.controls.nombres.value).toBe('Segunda');
    expect(mutate).not.toHaveBeenCalled(); noWrite(component);
  });

  it.each(['offline', 'role', 'owner', 'credential'])('blocks dispatch after %s changes before save', async mode => {
    const component = screen();
    await component.openEdit(original);
    if (mode === 'offline') online.set(false);
    if (mode === 'role') roles.set(['CAJERO']);
    if (mode === 'owner') owner = 'owner-b';
    if (mode === 'credential') vi.spyOn(TestBed.inject(AuthContextService), 'refresh').mockImplementation(() => { throw new Error('expired'); });
    await component.save();
    expect(mutate).not.toHaveBeenCalled(); noWrite(component);
    expect(component.dialogOpen()).toBe(true);
  });

  it('retains draft and retry key, rotates changed payload and ignores unconfirmed or obsolete acknowledgements', async () => {
    const component = screen();
    await component.openEdit(original);
    mutate.mockReturnValue(throwError(() => new Error('uncertain')));
    await component.save(); await component.save();
    expect(component.dialogOpen()).toBe(true); expect(component.form.controls.genero.value).toBe(original.genero);
    const key = (index: number) => mutate.mock.calls[index][0].context[IDEMPOTENCY_CONTEXT_KEY];
    expect(key(0)).toBe(key(1)); noWrite(component);
    component.form.patchValue({ nombres: 'Beatriz' });
    await component.save(); expect(key(2)).not.toBe(key(1));
    mutate.mockReturnValue(of({ data: { actualizarPaciente: { ...original, genero: undefined } } }));
    await component.save(); noWrite(component); expect(component.dialogOpen()).toBe(true);
    const pending = new Subject<unknown>(); mutate.mockReturnValue(pending);
    const saving = component.save(); await component.save(); expect(mutate).toHaveBeenCalledTimes(5);
    owner = 'owner-b'; pending.next({ data: { actualizarPaciente: original } }); pending.complete();
    await saving; noWrite(component);
  });

  it.each(['offline', 'role', 'owner', 'cancel', 'destroy', 'wrong-id', 'partial', 'errors'])('never commits a %s update reply', async mode => {
    const fixture = TestBed.createComponent(PatientsCatalog);
    const component = fixture.componentInstance;
    await component.openEdit(original);
    const pending = new Subject<unknown>(); mutate.mockReturnValue(pending);
    const saving = component.save();
    expect(mutate).toHaveBeenCalledTimes(1);
    if (mode === 'offline') online.set(false);
    if (mode === 'role') roles.set(['CAJERO']);
    if (mode === 'owner') owner = 'owner-b';
    if (mode === 'cancel') component.dialogOpen.set(false);
    if (mode === 'destroy') fixture.destroy();
    const updated = mode === 'wrong-id' ? { ...original, id: 'other' } : mode === 'partial' ? { id: 'p' } : original;
    pending.next({ data: { actualizarPaciente: updated }, ...(mode === 'errors' ? { errors: [{ message: 'rejected' }] } : {}) });
    pending.complete();
    await saving; noWrite(component);
  });
});
