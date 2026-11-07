import { Component, DestroyRef, inject, InjectionToken } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { NavigationStart, provideRouter, Router, RouterLink, RouterLinkActive, RouterOutlet, Routes, withNavigationErrorHandler } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { loadRemoteModule } from '@angular-architects/native-federation';
import type { PlatformConfigV1 } from '../../../packages/mfe-contract/index.js';
import { bounded } from './remote-runtime.mjs';
import { AUTH_SESSION, initializeAuthentication, NavigationStatus, PLATFORM_CONFIG } from './platform';
import { AuthService } from './auth.service';
import type { AuthSession } from './auth-session.mjs';
import { ModulePage } from './module-page';

@Component({ standalone: true, imports: [RouterLink], template: `
  <h1>Dental platform</h1><p>Three independently deployed applications, one workspace.</p>
  <ul><li><a routerLink="/erp">ERP</a> — billing, cash flow and catalogs.</li>
    <li><a routerLink="/operations">Operations</a> — scheduling and appointments.</li>
    <li><a routerLink="/clinical">Clinical</a> — patient histories and clinical records.</li></ul>` })
class Home {}
@Component({ standalone: true, imports: [RouterLink], template: '<h1>Page not found</h1><p>This address is not available.</p><a routerLink="/">Return home</a>' })
class Missing {}

@Component({ standalone: true, template: `
  <h1>Sign in</h1>
  @if (auth.state().status === 'unconfigured') {
    <p role="status">Authentication is not configured. Applications are unavailable.</p>
  } @else {
    <p>Use your organization account to open applications.</p>
    <button type="button" (click)="auth.login()" [disabled]="auth.busy()">Sign in</button>
  }
  @if (auth.error()) { <p role="alert">{{auth.error()}}</p> }
` })
class Login { readonly auth = inject(AuthService); }

@Component({ standalone: true, template: '<h1>Completing sign in</h1><p role="status">Checking your session…</p>' })
class Callback {
  constructor() { void inject(AuthService).callback(location.href); }
}

// Retiring the outlet also destroys native-federation route components on expiry/logout.
@Component({ standalone: true, imports: [RouterOutlet], template: `
  @if (auth.authenticated()) { <router-outlet /> }
  @else { <p role="status">Your session has ended. Sign in to continue.</p> }
` })
class AuthenticatedWorkspace { readonly auth = inject(AuthService); }
const authenticated = () => {
  const auth = inject(AuthService);
  return auth.session.getAccessToken() !== null || inject(Router).createUrlTree(['/login']);
};
/** Builds a fresh route tree; a new login needs new lazy ERP injectors and a new host lease. */
const ROUTE_FACTORY = new InjectionToken<() => Routes>('platform route factory');
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
      @if (auth.authenticated()) {
        <p>Signed in · {{auth.state().roles.join(', ')}}</p>
        <button type="button" (click)="auth.logout()">Sign out</button>
      } @else { <a routerLink="/login">Sign in</a> }
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
  readonly auth = inject(AuthService);
  readonly config = inject(PLATFORM_CONFIG);
  readonly status = inject(NavigationStatus);
  private readonly router = inject(Router);
  private readonly routes = inject(ROUTE_FACTORY);
  constructor() {
    // Lazy route injectors are cached by the router. When the session ends, replace the tree so a
    // later login mounts a new ERP bound to a new lease instead of reusing a retired injector.
    let wasAuthenticated = this.auth.authenticated();
    const unsubscribe = this.auth.session.subscribe(next => {
      const now = next.status === 'authenticated';
      if (wasAuthenticated && !now) this.router.resetConfig(this.routes());
      wasAuthenticated = now;
    });
    inject(DestroyRef).onDestroy(unsubscribe);
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.status.failedUrl.set(null);
    });
  }
  retry() { const url = this.status.failedUrl(); if (url) void this.router.navigateByUrl(url).catch(() => {}); }
}

// <erp-host-capability>
/**
 * One lease per ERP mount. It dies for good once the session leaves the verified subject
 * (logout, expiry, refresh rejection or a different subject), so a retained getter cannot
 * revive after a same-subject login. The token is read synchronously per call.
 */
export function createErpHostCapability(session: Pick<AuthSession, 'getAccessToken' | 'snapshot' | 'subscribe'>) {
  const bound = session.snapshot();
  let revoked = bound.status !== 'authenticated' || !bound.subject;
  let unsubscribe: (() => void) | undefined;
  const check = (next: { status: string; subject: string | null }) => {
    if (next.status !== 'authenticated' || next.subject !== bound.subject) {
      revoked = true;
      unsubscribe?.();
    }
  };
  unsubscribe = session.subscribe(check);
  if (revoked) unsubscribe();
  return {
    getAccessToken(): string | null {
      if (revoked) return null;
      check(session.snapshot());
      return revoked ? null : session.getAccessToken();
    },
  };
}
// </erp-host-capability>

export function bootstrap(config: PlatformConfigV1) {
  const authSession = initializeAuthentication(config);
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
  const buildRoutes = (): Routes => [
    { path: '', pathMatch: 'full', component: Home },
    { path: 'login', component: Login },
    { path: 'auth/callback', component: Callback },
    { path: 'erp', component: AuthenticatedWorkspace, canMatch: [authenticated], canActivateChild: [authenticated], children: [{ path: '', loadChildren: () => {
      const status = inject(NavigationStatus); status.loading.set(true); status.failedUrl.set(null);
      return bounded((async () => {
        // Public remoteEntry API initializes ERP only when this route is requested.
        const module = await loadRemoteModule({ remoteEntry: erp.entry, exposedModule: './Routes' });
        await erpStyles();
        // Hosted ERP: the configured endpoint plus this mount's lease. No storage/standalone fallback.
        if (typeof module.createErpRoutes !== 'function') throw Error('Invalid ERP routes');
        const children = module.createErpRoutes({
          mode: 'hosted', graphqlUrl: erp.apiBaseUrl, getAccessToken: createErpHostCapability(authSession).getAccessToken,
        });
        if (!Array.isArray(children)) throw Error('Invalid ERP routes');
        return [...children, { path: '**', component: Missing }];
      })()).finally(() => status.loading.set(false));
    } }] },
    ...['operations', 'clinical'].map(id => ({ path: id, component: AuthenticatedWorkspace, canMatch: [authenticated], canActivateChild: [authenticated], children: [{ path: '**', component: ModulePage, data: { remoteId: id } }] })),
    // Offline-only workspace: public route, no hosted capability, no revived lease.
    // Local ciphertext can be unlocked with its PIN; everything else still needs sign-in.
    { path: 'offline/erp', loadChildren: () => {
      const status = inject(NavigationStatus); status.loading.set(true); status.failedUrl.set(null);
      return bounded((async () => {
        const module = await loadRemoteModule({ remoteEntry: erp.entry, exposedModule: './OfflineRoutes' });
        await erpStyles();
        if (typeof module.createOfflineRoutes !== 'function') throw Error('Invalid offline routes');
        const issuer = config.oidc?.issuer ?? null;
        const children = module.createOfflineRoutes({
          endpoint: erp.apiBaseUrl,
          // Activation only uses a live session; the signed grant never becomes API auth.
          getOnlineContext: () => {
            const snapshot = authSession.snapshot();
            const token = authSession.getAccessToken();
            if (!issuer || snapshot.status !== 'authenticated' || !snapshot.subject || !token) return null;
            return { token, identityIssuer: issuer, identitySubject: snapshot.subject, epoch: authSession.snapshot().subject };
          },
        });
        if (!Array.isArray(children)) throw Error('Invalid offline routes');
        return [...children, { path: '**', component: Missing }];
      })()).finally(() => status.loading.set(false));
    } },
    { path: '**', component: Missing },
  ];
  return bootstrapApplication(Shell, { providers: [
    { provide: PLATFORM_CONFIG, useValue: config },
    { provide: AUTH_SESSION, useValue: authSession },
    { provide: ROUTE_FACTORY, useValue: buildRoutes },
    provideRouter(buildRoutes(), withNavigationErrorHandler(error => {
      const status = inject(NavigationStatus); status.loading.set(false); status.failedUrl.set(error.url);
    })),
  ] });
}
