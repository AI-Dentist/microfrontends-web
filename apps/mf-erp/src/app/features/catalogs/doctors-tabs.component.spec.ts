import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { DoctorsCatalog } from './doctors-catalog.component';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';

it.each([undefined, 'consultorios'])('preserves the default doctor tab and supports explicit rooms entry: %s', async (initialTab) => {
  await TestBed.configureTestingModule({ imports: [DoctorsCatalog], providers: [
    { provide: Apollo, useValue: { query: () => of({ data: {
      listarOdontologos: [], listarEspecialidades: [], listarConsultorios: [],
    } }) } },
    { provide: MessageService, useValue: { add: vi.fn() } },
    { provide: AuthContextService, useValue: { roles: () => ['ADMIN'] } },
    { provide: NetworkStatusService, useValue: { online: () => true, isOnline: () => true } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(DoctorsCatalog);
  if (initialTab) fixture.componentRef.setInput('initialTab', initialTab);
  await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('[role="tab"][aria-selected="true"]').textContent.trim())
    .toBe(initialTab ? 'Consultorios' : 'Odontólogos');
});

// JSDOM has no layout observer; real-browser resize remains part of T8.
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());
