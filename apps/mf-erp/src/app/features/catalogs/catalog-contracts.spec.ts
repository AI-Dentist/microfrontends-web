import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { CriticalMutationService } from '../../core/offline/critical-mutation.service';
import { LocalAiService } from '../../core/ai-local/local-ai.service';
import { DoctorsCatalog } from './doctors-catalog.component';
import { PatientsCatalog } from './patients-catalog.component';
import { ServicesTariff } from './services-tariff.component';
import { CompanySecurity } from './company-security.component';
import { CREAR_ESPECIALIDAD, CREAR_ODONTOLOGO, CREAR_CONSULTORIO, CREAR_SERVICIO_ODONTOLOGICO, ACTUALIZAR_CONFIGURACION_EMPRESA } from '../../core/graphql/mutations.graphql';
import { LISTAR_AUDIT_LOGS, LISTAR_USUARIOS, OBTENER_CONFIGURACION_EMPRESA } from '../../core/graphql/queries.graphql';
import { ACTUALIZAR_USUARIO, ACTUALIZAR_ESPECIALIDAD, ACTUALIZAR_CONSULTORIO } from './catalogs.graphql';

const company = { id: 'c', nombreComercial: 'Clínica', razonSocial: 'Clínica SRL', nit: '123', direccion: 'Calle 1', telefonoContacto: '71234567', emailContacto: null, monedaSimbolo: 'Bs' };
const roles = signal(['ADMIN']);
const mutate = vi.fn();
const query = vi.fn();
const run = vi.fn();
const messages = { add: vi.fn() };
let accept: (() => void) | undefined;
beforeEach(() => {
  roles.set(['ADMIN']); mutate.mockReset(); query.mockReset(); run.mockReset(); messages.add.mockReset(); accept = undefined;
  mutate.mockReturnValue(of({ data: { actualizarConfiguracionEmpresa: company, crearServicioOdontologico: { id: 'service', codigo: 'L1', nombre: 'Limpieza', descripcion: null, precioBaseBs: 150, especialidad: null, activo: true } } }));
  query.mockImplementation(({ query: document }) => of({ data: document === OBTENER_CONFIGURACION_EMPRESA ? { obtenerConfiguracionEmpresa: company } : document === LISTAR_USUARIOS ? { listarUsuarios: [] } : document === LISTAR_AUDIT_LOGS ? { listarAuditLogs: [] } : {} }));
  TestBed.configureTestingModule({ providers: [
    { provide: Apollo, useValue: { mutate, query } },
    { provide: AuthContextService, useValue: { roles, principalKey: () => 'test-owner', refresh: () => null } },
    { provide: NetworkStatusService, useValue: { online: signal(true), isOnline: () => true } },
    { provide: MessageService, useValue: messages },
    { provide: ConfirmationService, useValue: { confirm: (options: { accept: () => void }) => { accept = options.accept; } } },
    { provide: CriticalMutationService, useValue: { run } },
    { provide: LocalAiService, useValue: { ready: () => false } },
  ] });
});
function create<T>(factory: () => T): T { return TestBed.runInInjectionContext(factory); }

it('rejects incomplete existing-patient detail without a replacement mutation', async () => {
  const screen = create(() => new PatientsCatalog());
  const patient = { id: 'p', ciNit: '1', nombres: 'Ana', apellidos: 'Rojas', telefonoWhatsapp: '71234567', email: null, direccion: null, activo: true };
  await screen.openEdit(patient);
  expect(screen.dialogOpen()).toBe(false);
  screen.editing.set(patient); // Save also guards stale/programmatic edit state.
  await screen.save();
  expect(mutate).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
});

it('sends all required doctor fields and multiple specialty ids without invented active input', async () => {
  const screen = create(() => new DoctorsCatalog());
  screen.doctorForm.patchValue({ ci: '123', nombres: 'Ana', apellidos: 'Rojas', matriculaProfesional: 'MP1', telefono: '71234567', email: 'a@example.bo', porcentajeComision: 32.5, especialidadesIds: ['s1', 's2'] });
  await screen.saveDoctor();
  expect(mutate).toHaveBeenCalledWith({ mutation: CREAR_ODONTOLOGO, variables: { input: { ci: '123', nombres: 'Ana', apellidos: 'Rojas', matriculaProfesional: 'MP1', telefono: '71234567', email: 'a@example.bo', porcentajeComision: 32.5, especialidadesIds: ['s1', 's2'] } } });
});

it('creates specialties with loose codigo/nombre/descripcion arguments', async () => {
  const screen = create(() => new DoctorsCatalog());
  screen.specialtyForm.patchValue({ codigo: 'ENDO', nombre: 'Endodoncia', descripcion: '' });
  await screen.saveSpecialty();
  expect(mutate).toHaveBeenCalledWith({ mutation: CREAR_ESPECIALIDAD, variables: { codigo: 'ENDO', nombre: 'Endodoncia', descripcion: null } });
});

it('creates rooms without estado or activo and refuses editing inactive rooms', async () => {
  const screen = create(() => new DoctorsCatalog());
  screen.roomForm.patchValue({ codigo: 'C1', nombre: 'Consultorio', ubicacion: 'Piso 1' });
  await screen.saveRoom();
  expect(mutate).toHaveBeenCalledWith({ mutation: CREAR_CONSULTORIO, variables: { input: { codigo: 'C1', nombre: 'Consultorio', ubicacion: 'Piso 1' } } });
  screen.roomDialog.set(false);
  screen.openRoom({ id: 'r', codigo: 'C1', nombre: 'Consultorio', ubicacion: null, estado: 'INACTIVO' });
  expect(screen.roomDialog()).toBe(false);
});

it('uses raw service price and optional specialty without activo', async () => {
  const screen = create(() => new ServicesTariff());
  screen.form.patchValue({ codigo: 'L1', nombre: 'Limpieza', precioBaseBs: 150, especialidadId: 's1' });
  await screen.save();
  expect(mutate).toHaveBeenCalledWith({ mutation: CREAR_SERVICIO_ODONTOLOGICO, variables: { input: { codigo: 'L1', nombre: 'Limpieza', descripcion: null, precioBaseBs: 150, especialidadId: 's1' } } });
});

it('loads company but never users or audit for a non-admin and blocks admin mutations', async () => {
  roles.set(['RECEPCIONISTA']);
  const screen = create(() => new CompanySecurity());
  await screen.loadAll();
  expect(query.mock.calls.map(([options]) => options.query)).toEqual([OBTENER_CONFIGURACION_EMPRESA]);
  expect(screen.form.getRawValue()).toEqual({ nombreComercial: 'Clínica', razonSocial: 'Clínica SRL', nit: '123', direccion: 'Calle 1', telefonoContacto: '71234567', emailContacto: '' });
  await screen.save(); expect(mutate).not.toHaveBeenCalled();
  expect(screen.users()).toEqual([]); expect(screen.logs()).toEqual([]);
});

it('loads real audit fields for ADMIN and saves only writable company fields', async () => {
  const screen = create(() => new CompanySecurity());
  await screen.loadAll();
  expect(query).toHaveBeenCalledWith(expect.objectContaining({ query: LISTAR_AUDIT_LOGS, variables: { limite: 50 } }));
  await screen.save();
  expect(mutate).toHaveBeenCalledWith({ mutation: ACTUALIZAR_CONFIGURACION_EMPRESA, variables: { input: { nombreComercial: 'Clínica', razonSocial: 'Clínica SRL', nit: '123', direccion: 'Calle 1', telefonoContacto: '71234567', emailContacto: null } } });
});

it('updates users with rolCodigo and required activo', async () => {
  const screen = create(() => new CompanySecurity());
  const user = { id: 'u', username: 'recepcion', email: 'a@example.bo', nombreCompleto: 'Ana', activo: true, rol: { id: 'role', codigo: 'CAJERO', nombre: 'Cajero', permisos: [] } };
  mutate.mockReturnValue(of({ data: { actualizarUsuario: { ...user, rol: { ...user.rol, codigo: 'RECEPCIONISTA' } } } }));
  screen.changeRole(user, 'RECEPCIONISTA');
  await vi.waitFor(() => expect(screen.updatingUserId()).toBe(null));
  expect(mutate).toHaveBeenCalledWith({ mutation: ACTUALIZAR_USUARIO, variables: { id: 'u', input: { rolCodigo: 'RECEPCIONISTA', activo: true } } });
  expect(screen.users()[0].rol.codigo).toBe('RECEPCIONISTA');
});

it('does not remove doctors or announce success when logical deactivation returns false', async () => {
  const screen = create(() => new DoctorsCatalog());
  const doctor = { id: 'd', ci: '1', nombres: 'Ana', apellidos: 'Rojas', matriculaProfesional: 'MP1', telefono: '71234567', email: null, porcentajeComision: 30, especialidades: [], activo: true };
  screen.doctors.set([doctor]); mutate.mockReturnValue(of({ data: { eliminarOdontologo: false } }));
  screen.confirmDeleteDoctor(doctor); accept!();
  await vi.waitFor(() => expect(messages.add).toHaveBeenCalled());
  expect(screen.doctors()).toEqual([doctor]);
  expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  expect(messages.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
});

it('retains user rows and displays the exact backend self-deactivation rejection', async () => {
  const screen = create(() => new CompanySecurity());
  const user = { id: 'u', username: 'admin', email: 'a@example.bo', nombreCompleto: 'Ana', activo: true, rol: { id: 'r', codigo: 'ADMIN', nombre: 'Administrador', permisos: [] } };
  screen.users.set([user]);
  mutate.mockReturnValue(throwError(() => new Error('No puede desactivarse a sí mismo')));
  screen.toggleActive(user);
  await vi.waitFor(() => expect(screen.updatingUserId()).toBe(null));
  expect(screen.users()).toEqual([user]);
  expect(messages.add).toHaveBeenCalledWith({ severity: 'error', summary: 'No se pudo actualizar el usuario', detail: 'No puede desactivarse a sí mismo' });
  expect(messages.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
});

it.each(['CAJERO', 'RECEPCIONISTA', 'ODONTOLOGO'])('blocks all administrator catalog writes for %s', async role => {
  roles.set([role]);
  const doctors = create(() => new DoctorsCatalog());
  doctors.openDoctor(null); doctors.openSpecialty(null); doctors.openRoom(null);
  expect(doctors.doctorDialog()).toBe(false); expect(doctors.specialtyDialog()).toBe(false); expect(doctors.roomDialog()).toBe(false);
  await doctors.saveDoctor(); await doctors.saveSpecialty(); await doctors.saveRoom();
  const services = create(() => new ServicesTariff());
  services.openDialog(null); await services.save(); expect(services.dialogOpen()).toBe(false);
  expect(mutate).not.toHaveBeenCalled();
});

it('requires doctor CI, registration and phone before saving', async () => {
  const screen = create(() => new DoctorsCatalog());
  screen.doctorForm.patchValue({ nombres: 'Ana', apellidos: 'Rojas', porcentajeComision: 30 });
  await screen.saveDoctor();
  expect(screen.doctorForm.invalid).toBe(true); expect(mutate).not.toHaveBeenCalled();
});

it('preserves specialty edits with codigo and room maintenance updates without reactivation controls', async () => {
  const screen = create(() => new DoctorsCatalog());
  screen.openSpecialty({ id: 's', codigo: 'ENDO', nombre: 'Endodoncia', descripcion: 'Tratamiento', activo: true });
  await screen.saveSpecialty();
  expect(mutate).toHaveBeenCalledWith({ mutation: ACTUALIZAR_ESPECIALIDAD, variables: { id: 's', input: { codigo: 'ENDO', nombre: 'Endodoncia', descripcion: 'Tratamiento' } } });
  screen.openRoom({ id: 'r', codigo: 'C1', nombre: 'Consultorio', ubicacion: 'Piso 1', estado: 'DISPONIBLE' });
  screen.roomForm.patchValue({ estado: 'MANTENIMIENTO' });
  await screen.saveRoom();
  expect(mutate).toHaveBeenCalledWith({ mutation: ACTUALIZAR_CONSULTORIO, variables: { id: 'r', input: { codigo: 'C1', nombre: 'Consultorio', ubicacion: 'Piso 1', estado: 'MANTENIMIENTO' } } });
  expect(screen.roomStates).toEqual(['DISPONIBLE', 'MANTENIMIENTO']);
});

it('rejects empty WhatsApp before patient create', async () => {
  const screen = create(() => new PatientsCatalog());
  screen.openCreate(); screen.form.patchValue({ ciNit: '1', nombres: 'Ana', apellidos: 'Rojas' });
  await screen.save();
  expect(screen.errors()).toEqual({ telefonoWhatsapp: 'El WhatsApp es obligatorio' });
  expect(run).not.toHaveBeenCalled(); expect(screen.dialogOpen()).toBe(true);
});

it('keeps local patient creation queue behavior and normalizes WhatsApp without inventing readback', async () => {
  const screen = create(() => new PatientsCatalog());
  screen.openCreate(); screen.form.patchValue({ ciNit: '1', nombres: 'Ana', apellidos: 'Rojas', telefonoWhatsapp: '+591 7123-4567', fechaNacimiento: '1990-01-31', genero: 'F', direccion: 'Calle 1' });
  run.mockResolvedValue({ status: 'queued' });
  await screen.save();
  expect(run).toHaveBeenCalledWith('CrearPaciente', { input: { ciNit: '1', nombres: 'Ana', apellidos: 'Rojas', telefonoWhatsapp: '71234567', fechaNacimiento: '1990-01-31', genero: 'F', direccion: 'Calle 1', email: null } }, expect.anything());
  expect(screen.dialogOpen()).toBe(false);
  expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'info', summary: 'Sin conexión' }));
});

it.each(['patient', 'service', 'specialty', 'room'])('does not alter %s UI when deactivation returns false', async entity => {
  mutate.mockReturnValue(of({ data: { eliminarPaciente: false, eliminarServicioOdontologico: false, eliminarEspecialidad: false, eliminarConsultorio: false } }));
  const patients = create(() => new PatientsCatalog());
  const services = create(() => new ServicesTariff());
  const doctors = create(() => new DoctorsCatalog());
  const patient = { id: 'p', ciNit: '1', nombres: 'Ana', apellidos: 'Rojas', telefonoWhatsapp: '71234567', email: null, direccion: null, activo: true };
  const service = { id: 's', codigo: 'L1', nombre: 'Limpieza', descripcion: null, precioBaseBs: 150, especialidad: null, activo: true };
  const specialty = { id: 'e', codigo: 'ENDO', nombre: 'Endodoncia', descripcion: null, activo: true };
  const room = { id: 'r', codigo: 'C1', nombre: 'Consultorio', ubicacion: null, estado: 'DISPONIBLE' };
  patients.patients.set([patient]); services.services.set([service]); doctors.specialties.set([specialty]); doctors.rooms.set([room]);
  if (entity === 'patient') patients.confirmDelete(patient);
  if (entity === 'service') services.confirmDelete(service);
  if (entity === 'specialty') doctors.confirmDeleteSpecialty(specialty);
  if (entity === 'room') doctors.confirmDeleteRoom(room);
  accept!();
  await vi.waitFor(() => expect(messages.add).toHaveBeenCalled());
  expect(patients.patients()).toEqual([patient]); expect(services.services()).toEqual([service]); expect(doctors.specialties()).toEqual([specialty]); expect(doctors.rooms()).toEqual([room]);
  expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: 'El backend no confirmó la baja lógica' }));
  expect(messages.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
});
