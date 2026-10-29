import { Component, inject } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { NavigationStart, provideRouter, Router, RouterLink, RouterLinkActive, RouterOutlet, Routes, withNavigationErrorHandler } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { loadRemoteModule } from '@angular-architects/native-federation';
import type { PlatformConfigV1 } from '../../../packages/mfe-contract/index.js';
import { bounded } from './remote-runtime.mjs';
import { NavigationStatus, PLATFORM_CONFIG } from './platform';
import { ModulePage } from './module-page';

@Component({ standalone: true, imports: [RouterLink], template: `
  <h1>Dental platform</h1><p>Three independently deployed applications, one workspace.</p>
  <ul><li><a routerLink="/erp">ERP</a> — billing, cash flow and catalogs.</li>
    <li><a routerLink="/operations">Operations</a> — scheduling and appointments.</li>
    <li><a routerLink="/clinical">Clinical</a> — patient histories and clinical records.</li></ul>` })
class Home {}
@Component({ standalone: true, imports: [RouterLink], template: '<h1>Page not found</h1><p>This address is not available.</p><a routerLink="/">Return home</a>' })
class Missing {}
@Component({
  selector: 'platform-shell', standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="platform-header"><a class="brand" routerLink="/">Dental platform</a>
      <nav aria-label="Applications"><a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}" ariaCurrentWhenActive="page">Home</a>
        @for (remote of config.remotes; track remote.id) {
          <a [routerLink]="remote.basePath" routerLinkActive="active" ariaCurrentWhenActive="page">{{remote.label}}</a>
        }
      </nav>
    </header>
    <main id="main" tabindex="-1">
      @if (status.loading()) { <p role="status">Loading application…</p> }
      @if (status.failedUrl()) {
        <section role="alert"><h1>Application unavailable</h1><p>The application could not be opened. You can still use the other applications.</p>
          <button type="button" (click)="retry()">Retry original address</button></section>
      }
      <router-outlet />
    </main>`,
})
class Shell {
  readonly config = inject(PLATFORM_CONFIG);
  readonly status = inject(NavigationStatus);
  private readonly router = inject(Router);
  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.status.failedUrl.set(null);
    });
  }
  retry() { const url = this.status.failedUrl(); if (url) void this.router.navigateByUrl(url).catch(() => {}); }
}

export function bootstrap(config: PlatformConfigV1) {
  const erp = config.remotes.find(r => r.id === 'erp')!;
  let styleReady: Promise<void> | undefined;
  function erpStyles(): Promise<void> {
    if (!erp.styles) return Promise.resolve();
    if (!styleReady) {
      styleReady = (async () => {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = erp.styles!;
        const loaded = new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(Error('Styles unavailable')); });
        document.head.append(link);
        try { await bounded(loaded); }
        catch (error) {
          link.remove();
          styleReady = undefined;
          console.warn('ERP stylesheet unavailable; continuing with component layout styles:', error);
        }
        finally { link.onload = null; link.onerror = null; }
      })();
    }
    return styleReady;
  }
  const routes: Routes = [
    { path: '', pathMatch: 'full', component: Home },
    { path: 'erp', loadChildren: () => {
      const status = inject(NavigationStatus); status.loading.set(true); status.failedUrl.set(null);
      return bounded((async () => {
        // Public remoteEntry API initializes ERP only when this route is requested.
        const module = await loadRemoteModule({ remoteEntry: erp.entry, exposedModule: './Routes' });
        await erpStyles();
        const children = typeof module.createErpRoutes === 'function'
          ? module.createErpRoutes({ graphqlUrl: erp.apiBaseUrl }) : module.ERP_ROUTES ?? module.default;
        if (!Array.isArray(children)) throw Error('Invalid ERP routes');
        return [...children, { path: '**', component: Missing }];
      })()).finally(() => status.loading.set(false));
    } },
    ...['operations', 'clinical'].map(id => ({ path: id, children: [{ path: '**', component: ModulePage, data: { remoteId: id } }] })),
    { path: '**', component: Missing },
  ];
  return bootstrapApplication(Shell, { providers: [
    { provide: PLATFORM_CONFIG, useValue: config },
    provideRouter(routes, withNavigationErrorHandler(error => {
      const status = inject(NavigationStatus); status.loading.set(false); status.failedUrl.set(error.url);
    })),
  ] });
}
