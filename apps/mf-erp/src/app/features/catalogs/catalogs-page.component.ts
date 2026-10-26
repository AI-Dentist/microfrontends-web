import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { PatientsCatalog } from './patients-catalog.component';
import { DoctorsCatalog } from './doctors-catalog.component';
import { CompanySecurity } from './company-security.component';
import { ServicesTariff } from './services-tariff.component';

/** Composition only: child modules retain their CRUD, cache and permission guards. */
@Component({
  selector: 'erp-catalogs-page',
  imports: [TabsModule, PatientsCatalog, DoctorsCatalog, CompanySecurity, ServicesTariff],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4">
      <h1 class="px-4 pt-4 text-xl font-semibold">Catálogos maestros</h1>
      <p-tabs [value]="active()" (valueChange)="active.set($any($event))">
        <p-tablist>
          <p-tab value="pacientes">Pacientes</p-tab>
          <p-tab value="odontologos">Odontólogos</p-tab>
          <p-tab value="consultorios">Consultorios</p-tab>
          <p-tab value="empresa">Configuración de Empresa</p-tab>
          <p-tab value="arancel">Arancel de Servicios</p-tab>
        </p-tablist>
        <p-tabpanels>
          <p-tabpanel value="pacientes">@if (active() === 'pacientes') { <erp-patients-catalog /> }</p-tabpanel>
          <p-tabpanel value="odontologos">@if (active() === 'odontologos') { <erp-doctors-catalog /> }</p-tabpanel>
          <p-tabpanel value="consultorios">@if (active() === 'consultorios') { <erp-doctors-catalog initialTab="consultorios" /> }</p-tabpanel>
          <p-tabpanel value="empresa">@if (active() === 'empresa') { <erp-company-security /> }</p-tabpanel>
          <p-tabpanel value="arancel">@if (active() === 'arancel') { <erp-services-tariff /> }</p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </section>
  `,
})
export class CatalogsPage {
  protected readonly active = signal('pacientes');
}
