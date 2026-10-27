import { Component, inject } from '@angular/core';
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
  it('exposes host-relative children, self-contained providers and the composed catalog', () => {
    expect(ERP_ROUTES[0].path).toBe('');
    expect(ERP_ROUTES[0].providers?.length).toBeGreaterThan(0);
    const children = ERP_ROUTES[0].children!;
    expect(children.find(r => r.path === '')?.redirectTo).toBe('dashboard');
    for (const path of ['dashboard', 'billing', 'agent-console']) {
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
