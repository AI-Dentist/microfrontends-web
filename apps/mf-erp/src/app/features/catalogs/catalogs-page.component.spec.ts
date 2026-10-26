import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabsModule } from 'primeng/tabs';
import { CatalogsPage } from './catalogs-page.component';

@Component({ selector: 'erp-patients-catalog', template: 'Pacientes' }) class PatientStub {}
@Component({ selector: 'erp-doctors-catalog', template: 'Panel {{ initialTab() }}' })
class DoctorStub { readonly initialTab = input('odontologos'); }
@Component({ selector: 'erp-company-security', template: 'Empresa' }) class CompanyStub {}
@Component({ selector: 'erp-services-tariff', template: 'Arancel semántico' }) class TariffStub {}

it('composes exactly five catalog tabs and mounts only the selected existing module', async () => {
  await TestBed.configureTestingModule({ imports: [CatalogsPage] })
    .overrideComponent(CatalogsPage, { set: { imports: [TabsModule, PatientStub, DoctorStub, CompanyStub, TariffStub] } })
    .compileComponents();
  const fixture = TestBed.createComponent(CatalogsPage); await fixture.whenStable();
  const tabs = [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLElement[];
  expect(tabs.map(t => t.textContent?.trim())).toEqual([
    'Pacientes', 'Odontólogos', 'Consultorios', 'Configuración de Empresa', 'Arancel de Servicios',
  ]);
  expect(fixture.nativeElement.querySelector('erp-patients-catalog')).not.toBeNull();
  expect(fixture.nativeElement.querySelector('erp-doctors-catalog')).toBeNull();
  tabs[2].click(); await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('erp-patients-catalog')).toBeNull();
  expect(fixture.nativeElement.querySelectorAll('erp-doctors-catalog')).toHaveLength(1);
  expect(fixture.nativeElement.querySelector('erp-doctors-catalog').textContent).toContain('consultorios');
  tabs[4].click(); await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('erp-services-tariff')).not.toBeNull();
  expect(fixture.nativeElement.querySelector('erp-doctors-catalog')).toBeNull();
});

// JSDOM has no layout observer; real-browser resize remains part of T8.
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());
