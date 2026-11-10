import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { defaultKpiPeriod, validateKpiPeriod } from './kpi-period';
import { KpiDataLoaderService } from './kpi-data-loader.service';

@Component({
  selector: 'erp-kpi-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-wrap items-end gap-3 text-sm" (submit)="$event.preventDefault(); apply()">
      <label class="block">
        <span class="mb-1 block font-medium text-slate-600">Desde</span>
        <input
          type="date"
          name="desde"
          aria-label="Desde"
          [value]="desde()"
          (input)="desde.set($any($event.target).value)"
          class="rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none"
        />
      </label>
      <label class="block">
        <span class="mb-1 block font-medium text-slate-600">Hasta</span>
        <input
          type="date"
          name="hasta"
          aria-label="Hasta"
          [value]="hasta()"
          (input)="hasta.set($any($event.target).value)"
          class="rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        class="rounded bg-teal-600 px-4 py-1.5 font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
        [disabled]="loader.loading()"
      >
        Aplicar
      </button>
    </form>
    @if (error() || loader.periodError(); as err) {
      <p class="mt-2 rounded bg-red-50 p-2 text-sm text-red-700" role="alert" data-testid="kpi-period-error">
        {{ err }}
      </p>
    }
  `,
})
export class KpiFilterComponent implements OnInit {
  protected readonly loader = inject(KpiDataLoaderService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly desde = signal<string>('');
  readonly hasta = signal<string>('');
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const qDesde = this.route.snapshot.queryParamMap.get('desde');
    const qHasta = this.route.snapshot.queryParamMap.get('hasta');

    if (qDesde !== null || qHasta !== null) {
      this.desde.set(qDesde ?? '');
      this.hasta.set(qHasta ?? '');
      const res = validateKpiPeriod({ desde: qDesde ?? '', hasta: qHasta ?? '' });
      if (res.valid) {
        this.error.set(null);
        this.loader.load(res.period);
      } else {
        this.error.set(res.error);
        this.loader.periodError.set(res.error);
      }
    } else {
      const def = defaultKpiPeriod();
      this.desde.set(def.desde);
      this.hasta.set(def.hasta);
      this.error.set(null);
      this.loader.load(def);
    }
  }

  apply(): void {
    const candidate = { desde: this.desde(), hasta: this.hasta() };
    const res = validateKpiPeriod(candidate);
    if (!res.valid) {
      this.error.set(res.error);
      this.loader.periodError.set(res.error);
      return;
    }

    this.error.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { desde: res.period.desde, hasta: res.period.hasta },
      queryParamsHandling: 'merge',
    });
    this.loader.load(res.period);
  }
}
