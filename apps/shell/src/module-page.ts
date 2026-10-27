import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import type { RemoteContextV1, RemoteModuleV1 } from '../../../packages/mfe-contract/index.js';
import { PLATFORM_CONFIG, getAccessToken } from './platform';
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly remote = inject(PLATFORM_CONFIG).remotes.find(r => r.id === this.route.snapshot.data['remoteId'])!;
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  @ViewChild('surface', { static: true }) surface!: ElementRef<HTMLElement>;
  private session?: ReturnType<typeof createRemoteSession>;
  private readonly navigation = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
    void this.session?.update(this.context());
  });
  private readonly onNavigate = (path: string) => {
    const target = confinedPath(path, this.remote.basePath, location.origin);
    if (target) void this.router.navigateByUrl(target).catch(() => this.state.set('error'));
  };
  private context(): RemoteContextV1 {
    return { contractVersion: 1, basePath: this.remote.basePath, path: this.router.url.split('#')[0], apiBaseUrl: this.remote.apiBaseUrl, getAccessToken, onNavigate: this.onNavigate };
  }
  private root?: ShadowRoot;
  private container?: HTMLElement;
  ngAfterViewInit() {
    this.root = this.surface.nativeElement.attachShadow({ mode: 'open' });
    this.retry();
  }
  retry() {
    if (!this.root) return;
    void this.session?.destroy();
    this.container?.remove();
    const root = this.root;
    const container = document.createElement('div'); root.append(container);
    this.container = container;
    this.session = createRemoteSession({
      container,
      loadModule: () => import(/* @vite-ignore */ this.remote.entry) as Promise<RemoteModuleV1>,
      loadStyle: () => loadStyles(root, this.remote.styles!),
      onState: state => this.state.set(state),
    });
    void this.session.start(this.context());
  }
  ngOnDestroy() { this.navigation.unsubscribe(); void this.session?.destroy(); }
}
