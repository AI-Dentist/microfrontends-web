import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'erp' },
  { path: 'erp', loadChildren: () => import('./erp.routes') },
  { path: '**', redirectTo: 'erp' },
];
