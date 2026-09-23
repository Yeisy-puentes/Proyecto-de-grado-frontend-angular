import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
  host: {
    '(document:keydown.escape)': 'confirm.close(false)',
  },
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    // Al abrirse, el foco va a "Cancelar" (la opción segura), para que Enter no elimine por accidente.
    effect(() => {
      if (this.confirm.current()) queueMicrotask(() => this.cancelButton()?.nativeElement.focus());
    });
  }
}
