import { Component, createEnvironmentInjector, EnvironmentInjector, inject } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Route, Router, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { ERP_ROUTES, createErpRoutes } from './erp.routes';
import { routes } from './app.routes';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Frame {}
@Component({ template: '<h1>{{ route.snapshot.title }}</h1>' })
class Leaf { readonly route = inject(ActivatedRoute); }

// Isolate route recognition from live financial components and route HTTP providers.
function isolated(route: Route): Route {
  const { providers, component, loadComponent, loadChildren, children, ...config } = route;
  if (config.redirectTo !== undefined) return config;
  return children ? { ...config, component: Frame, children: children.map(isolated) } : { ...config, component: Leaf };
}

describe('ERP canonical navigation contract', () => {
  it('creates independent configured routes while preserving the default export', () => {
    const configured = createErpRoutes({ graphqlUrl: 'https://shell.example/api/erp/graphql' });
    expect(configured).not.toBe(ERP_ROUTES);
    expect(configured[0].children?.map(r => r.path)).toEqual(ERP_ROUTES[0].children?.map(r => r.path));
    expect(createErpRoutes()[0].path).toBe('');
  });
  it('carries the hosted capability through native-federation route creation, without a storage credential', async () => {
    const hostToken = `e30.${btoa(JSON.stringify({ iss: 'host', sub: 'synthetic-odo', realm_access: { roles: ['ODONTOLOGO'] } }))}.signature`;
    const getAccessToken = vi.fn(() => hostToken);
    const storageRead = vi.fn(() => null);
    vi.stubGlobal('localStorage', { getItem: storageRead });
    vi.stubGlobal('sessionStorage', { getItem: storageRead });
    const config = { mode: 'hosted' as const, graphqlUrl: 'https://fixture.example/rpc?target=erp', getAccessToken };
    const configured = createErpRoutes(config);
    TestBed.configureTestingModule({});
    const injector = createEnvironmentInjector([
      ...(configured[0].providers ?? []), provideHttpClientTesting(),
    ], TestBed.inject(EnvironmentInjector));
    try {
      const apollo = injector.get(Apollo);
      const http = injector.get(HttpTestingController);
      const done = firstValueFrom(apollo.query({ query: gql`query HostedRouteProbe { probe }` }));
      for (let n = 0; n < 30; n++) await Promise.resolve();
      const request = http.expectOne(config.graphqlUrl);
      const authorization = request.request.headers.get('Authorization');
      const devHeader = request.request.headers.get('X-Dev-User');
      request.flush({ data: { probe: true } });
      expect((await done).data).toEqual({ probe: true });
      expect(authorization).toBe(`Bearer ${hostToken}`);
      expect(devHeader).toBeNull();
      expect(getAccessToken).toHaveBeenCalled();
      expect(storageRead).not.toHaveBeenCalled();
      http.verify();
    } finally {
      injector.destroy();
      vi.unstubAllGlobals();
    }
  });

  it('exposes host-relative children, self-contained providers and the composed catalog', () => {
    expect(ERP_ROUTES[0].path).toBe('');
    expect(ERP_ROUTES[0].providers?.length).toBeGreaterThan(0);
    const children = ERP_ROUTES[0].children!;
    expect(children.find(r => r.path === '')?.redirectTo).toBe('dashboard');
    for (const path of ['dashboard', 'billing', 'agent-console', 'kpis', 'kpis/:kpi']) {
      expect(typeof children.find(r => r.path === path)?.loadComponent).toBe('function');
    }
    const catalog = children.find(r => r.path === 'catalogs')!;
    expect(typeof catalog.children?.find(r => r.path === '')?.loadComponent).toBe('function');
    expect(children.some(r => r.path === 'erp')).toBe(false);
  });

  it.each(['standalone', 'federated'])('mounts %s exactly once and preserves legacy destinations', async mode => {
    const children = ERP_ROUTES.map(isolated);
    const config = mode === 'standalone'
      ? routes.map(r => r.path === 'erp' ? { path: 'erp', children } : r)
      : [{ path: 'clinic', children: [{ path: 'erp', children }] }];
    TestBed.configureTestingModule({ providers: [provideRouter(config)] });
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    const base = mode === 'standalone' ? '/erp' : '/clinic/erp';
    for (const [suffix, target, title] of [
      ['', 'dashboard', 'Flujo de caja'],
      ['/cash-flow', 'dashboard', 'Flujo de caja'],
      ['/reports', 'agent-console', 'Agente ERP'],
      ['/kpis', 'kpis', 'KPIs ejecutivos'],
      ['/kpis/ingresos', 'kpis/ingresos', 'Detalle de KPI'],
      ['/billing', 'billing', 'Órdenes de cobro'],
      ['/catalogs', 'catalogs', 'Catálogos'],
      ['/catalogs/patients', 'catalogs/patients', 'Pacientes'],
      ['/catalogs/doctors', 'catalogs/doctors', 'Odontólogos'],
      ['/catalogs/services', 'catalogs/services', 'Tarifario'],
      ['/catalogs/company', 'catalogs/company', 'Empresa y seguridad'],
    ]) {
      await harness.navigateByUrl(base + suffix);
      expect(router.url).toBe(base + '/' + target);
      expect(harness.routeNativeElement?.textContent).toContain(title);
      expect(router.url).not.toContain('/erp/erp');
    }
  });
});
