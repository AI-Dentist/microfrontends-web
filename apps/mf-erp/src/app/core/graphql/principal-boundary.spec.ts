import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { AuthContextService } from '../auth/auth-context.service';
import { provideErpGraphql } from './graphql.provider';
import { CREAR_PACIENTE } from './mutations.graphql';

const input = { ciNit: '123', nombres: 'Ana', apellidos: 'Perez', telefonoWhatsapp: '+59171234567' };
const patient = { id: '00000000-0000-0000-0000-000000000001', ...input, email: null, direccion: null, activo: true };
function setup() {
  let principal = 'A';
  TestBed.configureTestingModule({ providers: [
    ...provideErpGraphql(), provideHttpClientTesting(),
    { provide: AuthContextService, useValue: {
      refresh: () => `token:${principal}`, principalKey: () => principal, devUserHeader: () => null,
    } },
  ] });
  return { http: TestBed.inject(HttpTestingController), apollo: TestBed.inject(Apollo), switchUser: () => { principal = 'B'; } };
}

it('never forwards an action owned by A after deferred credentials switch to B', async () => {
  const { http, apollo, switchUser } = setup();
  const done = firstValueFrom(apollo.mutate({ mutation: CREAR_PACIENTE, variables: { input },
    context: { ownerPrincipal: 'A', idempotencyKey: 'original-key' },
  })).catch((error) => error);
  switchUser();
  // Drain Apollo's scheduled context work; finish any unexpected request before asserting.
  for (let n = 0; n < 30; n++) await Promise.resolve();
  const forwarded = http.match(() => true);
  forwarded.forEach((request) => request.flush({ data: { crearPaciente: patient } }));
  const result = await done;
  expect(forwarded).toHaveLength(0);
  expect(result).toBeInstanceOf(Error);
  http.verify();
});

it('preserves normal same-owner mutation headers and payload', async () => {
  const { http, apollo } = setup();
  const done = firstValueFrom(apollo.mutate({ mutation: CREAR_PACIENTE, variables: { input },
    context: { ownerPrincipal: 'A', idempotencyKey: 'original-key' },
  }));
  for (let n = 0; n < 30; n++) await Promise.resolve();
  const request = http.expectOne(() => true);
  expect(request.request.headers.get('Authorization')).toBe('Bearer token:A');
  expect(request.request.headers.get('Idempotency-Key')).toBe('original-key');
  expect(request.request.body.variables).toEqual({ input });
  request.flush({ data: { crearPaciente: patient } });
  expect((await done).data?.crearPaciente.id).toBe(patient.id);
  http.verify();
});
