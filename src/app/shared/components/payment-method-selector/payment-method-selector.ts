import { Component, input, model } from '@angular/core';
import { PAYMENT_METHODS, PaymentMethod, SELECTABLE_PAYMENT_METHODS } from '../../../core/models/repair.model';

/** Botones tipo "chip" para elegir el método de pago. Soporta [(value)]. */
@Component({
  selector: 'app-payment-method-selector',
  templateUrl: './payment-method-selector.html',
  styleUrl: './payment-method-selector.css',
})
export class PaymentMethodSelector {
  readonly value = model<PaymentMethod | null>(null);
  /** 'grid' = 3 columnas (modal de arreglo), 'wrap' = fila flexible (detalle de cliente). */
  readonly layout = input<'grid' | 'wrap'>('wrap');

  /** En el orden pedido: Efectivo, Tarjeta, Transferencia. */
  protected readonly methods = SELECTABLE_PAYMENT_METHODS.map((value) => PAYMENT_METHODS.find((m) => m.value === value)!);

  protected select(method: PaymentMethod): void {
    // Un segundo clic sobre el mismo método lo deselecciona (el pago es opcional).
    this.value.update((current) => (current === method ? null : method));
  }
}
