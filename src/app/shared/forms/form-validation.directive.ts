import { Directive, ElementRef, inject } from '@angular/core';
import { NgForm } from '@angular/forms';

/**
 * Al enviar un formulario con errores, lleva el foco al primer campo inválido
 * (los mensajes los muestra <app-field-error>). Sustituye a la validación nativa del navegador.
 *
 * Uso: <form appFormValidation #f="ngForm" (ngSubmit)="f.valid && guardar()">
 */
@Directive({
  selector: 'form[appFormValidation]',
  host: { '(submit)': 'focusFirstInvalid()' },
})
export class FormValidation {
  private readonly form = inject(NgForm);
  private readonly el = inject<ElementRef<HTMLFormElement>>(ElementRef);

  protected focusFirstInvalid(): void {
    if (this.form.valid) return;
    // Se espera a que Angular aplique las clases ng-submitted / ng-invalid.
    queueMicrotask(() => {
      const field = this.el.nativeElement.querySelector<HTMLElement>(
        'input.ng-invalid, textarea.ng-invalid, select.ng-invalid',
      );
      field?.focus();
    });
  }
}
