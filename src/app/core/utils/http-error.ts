import { HttpErrorResponse } from '@angular/common/http';

/** Extrae un mensaje legible de un error HTTP del backend ({ error: "..." }). */
export function apiErrorMessage(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'No se pudo conectar con el servidor. Verifica que el backend esté encendido.';
    const body = err.error;
    if (body && typeof body === 'object' && typeof body.error === 'string') return body.error;
    return fallback;
  }
  // Errores propios del front (p. ej. un estado o tipo de pago que no existe en la BD).
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
