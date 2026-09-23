import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Texto del botón de confirmar (por defecto "Eliminar"). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' = rojo con icono de papelera; 'warning' = naranja con icono de alerta. */
  tone?: 'danger' | 'warning';
}

interface ConfirmRequest extends Required<ConfirmOptions> {
  resolve: (value: boolean) => void;
}

/**
 * Diálogo de confirmación con el diseño de la app (reemplaza al confirm() del navegador).
 * Uso: `if (!(await this.confirm.ask({ title, message }))) return;`
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<ConfirmRequest | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    // Si ya había uno abierto, se da por cancelado.
    this.current()?.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.current.set({
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        tone: 'danger',
        ...options,
        resolve,
      });
    });
  }

  close(result: boolean): void {
    const request = this.current();
    if (!request) return;
    this.current.set(null);
    request.resolve(result);
  }
}
