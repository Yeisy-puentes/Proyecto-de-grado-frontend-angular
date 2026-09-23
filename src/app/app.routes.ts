import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { MainLayout } from './layout/main-layout/main-layout';
import { Login } from './pages/login/login';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard], title: 'Iniciar Sesión · Interfajas' },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard · Interfajas',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'arreglos',
        title: 'Arreglos · Interfajas',
        loadComponent: () => import('./pages/repairs/repairs').then((m) => m.Repairs),
      },
      {
        path: 'agenda',
        title: 'Agenda · Interfajas',
        loadComponent: () => import('./pages/agenda/agenda').then((m) => m.Agenda),
      },
      {
        path: 'clientes',
        title: 'Clientes · Interfajas',
        loadComponent: () => import('./pages/clients/clients').then((m) => m.Clients),
      },
      {
        path: 'clientes/:id',
        title: 'Detalle de Cliente · Interfajas',
        loadComponent: () => import('./pages/client-detail/client-detail').then((m) => m.ClientDetail),
      },
      {
        path: 'informes',
        title: 'Informes · Interfajas',
        loadComponent: () => import('./pages/reports/reports').then((m) => m.Reports),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
