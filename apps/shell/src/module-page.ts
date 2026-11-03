import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import type { RemoteContextV1, RemoteModuleV1 } from '../../../packages/mfe-contract/index.js';
import { AUTH_SESSION, PLATFORM_CONFIG, getAccessToken } from './platform';
import { confinedPath, createRemoteSession, loadStyles } from './remote-runtime.mjs';

@Component({
  standalone: true,
  template: `
    <h1>{{ remote.label }}</h1>
    @if (state() === 'loading') { <p role="status">Loading application…</p> }
    @if (state() === 'error') {
      <section role="alert"><p>This application could not be loaded. The platform is still available.</p>
        <button type="button" (click)="retry()">Retry</button>
        <p>If retry fails, reload the page after the deployment is available.</p></section>
    }
    <div #surface [hidden]="state() !== 'ready'"></div>
  `,
})
export class ModulePage implements AfterViewInit, OnDestroy {
  private readonly auth = inject(AUTH_SESSION);
  private readonly principal = this.auth.snapshot().subject;
  private unsubscribeAuth?: () => void;
  private retired = false;
  private lease?: { revoked: boolean };
  private allowed(lease = this.lease) {
    const token = getAccessToken();
    return !this.retired && !!lease && !lease.revoked && lease === this.lease && token !== null && this.auth.snapshot().subject === this.principal;
  }
  private retireMount() {
    // Revoke synchronously, before asynchronous teardown or a replacement mount.
    if (this.lease) this.lease.revoked = true;
    this.lease = undefined;
    void this.session?.destroy();
    this.container?.remove();
  }
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly remote = inject(PLATFORM_CONFIG).remotes.find(r => r.id === this.route.snapshot.data['remoteId'])!;
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  @ViewChild('surface', { static: true }) surface!: ElementRef<HTMLElement>;
  private session?: ReturnType<typeof createRemoteSession>;
  private readonly navigation = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
    if (this.allowed()) void this.session?.update(this.context(this.lease!));
  });
  private context(lease: { revoked: boolean }): RemoteContextV1 {
    const services = this.remote.serviceBaseUrls;
    return {
      contractVersion: 1, basePath: this.remote.basePath, path: this.router.url.split('#')[0], apiBaseUrl: this.remote.apiBaseUrl,
      ...(services ? { serviceBaseUrls: Object.freeze({ ...services }) } : {}),
      getAccessToken: () => this.allowed(lease) ? getAccessToken() : null,
      onNavigate: (path: string) => {
        if (!this.allowed(lease)) return;
        const target = confinedPath(path, this.remote.basePath, location.origin);
        if (target) void this.router.navigateByUrl(target).catch(() => {
          if (this.allowed(lease)) this.state.set('error');
        });
      },
    };
  }
  private root?: ShadowRoot;
  private container?: HTMLElement;
  ngAfterViewInit() {
    this.root = this.surface.nativeElement.attachShadow({ mode: 'open' });
    this.unsubscribeAuth = this.auth.subscribe(next => {
      if (next.status !== 'authenticated' || next.subject !== this.principal) {
        this.retired = true;
        this.retireMount();
        this.state.set('error');
      }
    });
    this.retry();
  }
  retry() {
    if (!this.root || this.retired || getAccessToken() === null || this.auth.snapshot().subject !== this.principal) return;
    this.retireMount();
    const lease = { revoked: false };
    this.lease = lease;
    const root = this.root;
    const container = document.createElement('div'); root.append(container);
    this.container = container;
    this.session = createRemoteSession({
      container,
      loadModule: () => import(/* @vite-ignore */ this.remote.entry) as Promise<RemoteModuleV1>,
      loadStyle: () => loadStyles(root, this.remote.styles!),
      onState: state => { if (this.allowed(lease)) this.state.set(state); },
    });
    void this.session.start(this.context(lease));
  }
  ngOnDestroy() {
    this.retired = true;
    this.retireMount();
    this.unsubscribeAuth?.();
    this.navigation.unsubscribe();
  }
}
