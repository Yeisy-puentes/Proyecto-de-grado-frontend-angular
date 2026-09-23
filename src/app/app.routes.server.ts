import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Todas las páginas requieren sesión (token guardado en el navegador) y datos del
 * backend, así que se renderizan en el cliente. Prerenderizarlas en el servidor
 * solo produciría la redirección al login.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
