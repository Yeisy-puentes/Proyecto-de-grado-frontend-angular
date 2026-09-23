import { Component, computed, effect, input, signal } from '@angular/core';
import { NgForm, NgModel } from '@angular/forms';
import { Observable, merge } from 'rxjs';

/**
 * Mensaje de validación con el diseño de la app (reemplaza la burbuja nativa del navegador).
 * Se muestra cuando el campo es inválido y el usuario ya lo tocó o intentó enviar el formulario.
 *
 * Uso:
 *   <input name="titulo" required [(ngModel)]="..." #titulo="ngModel" />
 *   <app-field-error [control]="titulo" [form]="f" />
 */
@Component({
  selector: 'app-field-error',
  templateUrl: './field-error.html',
  styleUrl: './field-error.css',
})
export class FieldError {
  readonly control = input.required<NgModel>();
  /** Formulario al que pertenece (para mostrar errores tras intentar enviar). */
  readonly form = input<NgForm | null>(null);
  /** Mensajes personalizados por tipo de error (required, email, min...). */
  readonly messages = input<Partial<Record<string, string>>>({});

  /**
   * El estado del control (touched, errores, enviado) no es un signal. Este contador se
   * incrementa con cada evento del campo o del formulario para que el componente se
   * vuelva a dibujar (Angular 22 usa OnPush por defecto).
   */
  private readonly version = signal(0);

  constructor() {
    effect((onCleanup) => {
      const sources: Observable<unknown>[] = [this.control().control.events];
      const form = this.form();
      if (form) sources.push(form.form.events);
      const subscription = merge(...sources).subscribe(() => this.version.update((v) => v + 1));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  private readonly defaults = computed<Partial<Record<string, string>>>(() => ({
    required: 'Este campo es obligatorio.',
    email: 'Ingresa un correo electrónico válido.',
    ...this.messages(),
  }));

  protected readonly message = computed<string | null>(() => {
    this.version();
    const control = this.control();
    const visible = control.invalid && (control.touched || this.form()?.submitted);
    if (!visible || !control.errors) return null;

    const [key, detail] = Object.entries(control.errors)[0];
    const custom = this.defaults()[key];
    if (custom) return custom;
    if (key === 'min') return `El valor mínimo es ${detail.min}.`;
    if (key === 'max') return `El valor máximo es ${detail.max}.`;
    if (key === 'minlength') return `Debe tener al menos ${detail.requiredLength} caracteres.`;
    return 'Revisa este campo.';
  });
}
