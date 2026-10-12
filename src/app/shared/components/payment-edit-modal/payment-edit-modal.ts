import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { Payment, PaymentMethod, Repair, SELECTABLE_PAYMENT_METHODS } from '../../../core/models/repair.model';
import { ConfirmService } from '../../../core/services/confirm.service';
import { PaymentService } from '../../../core/services/payment.service';
import { ToastService } from '../../../core/services/toast.service';
import { fromDateKey, todayKey } from '../../../core/utils/date.utils';
import { apiErrorMessage } from '../../../core/utils/http-error';
import { CopCurrencyPipe } from '../../pipes/cop-currency.pipe';
import { PaymentMethodSelector } from '../payment-method-selector/payment-method-selector';

/**
 * Modal para corregir o eliminar un pago ya registrado (PUT / DELETE /pagos/:id).
 * Emite `saved` después de guardar o eliminar, para que la página recargue su lista.
 */
@Component({
  selector: 'app-payment-edit-modal',
  imports: [DatePipe, CopCurrencyPipe, PaymentMethodSelector],
  templateUrl: './payment-edit-modal.html',
  styleUrl: './payment-edit-modal.css',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class PaymentEditModal implements OnInit {
  private readonly paymentService = inject(PaymentService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly payment = input.required<Payment>();
  readonly repair = input.required<Repair>();
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly fromDateKey = fromDateKey;
  protected readonly today = todayKey();
  protected readonly amount = signal('');
  protected readonly method = signal<PaymentMethod | null>(null);
  protected readonly date = signal('');
  protected readonly busy = signal(false);

  ngOnInit(): void {
    const p = this.payment();
    this.amount.set(p.amount.toLocaleString('es-CO'));
    this.method.set(p.method);
    this.date.set(p.date);
  }

  /** Lo máximo que puede valer este pago: el saldo actual más lo que ya vale el pago. */
  protected maxAmount(): number {
    return this.repair().balance + this.payment().amount;
  }

  /** El método guardado no está entre los botones (p. ej. Nequi): se conserva si no se elige otro. */
  protected isLegacyMethod(): boolean {
    return !SELECTABLE_PAYMENT_METHODS.includes(this.payment().method) && this.method() === this.payment().method;
  }

  protected onAmountInput(value: string): void {
    const digits = value.replace(/[^\d]/g, '');
    this.amount.set(digits ? Number(digits).toLocaleString('es-CO') : '');
  }

  protected async save(): Promise<void> {
    const amount = Number(this.amount().replace(/[^\d]/g, ''));
    const method = this.method();
    const date = this.date();
    if (!amount || amount <= 0) {
      this.toast.error('Ingresa un monto válido.');
      return;
    }
    if (amount > this.maxAmount()) {
      this.toast.error(`El monto no puede superar $${this.maxAmount().toLocaleString('es-CO')} (saldo del arreglo).`);
      return;
    }
    if (!method) {
      this.toast.error('Selecciona el método de pago.');
      return;
    }
    if (!date || date > this.today) {
      this.toast.error('La fecha del pago no puede estar vacía ni ser futura.');
      return;
    }
    this.busy.set(true);
    try {
      await this.paymentService.update(this.payment(), { amount, method, date });
      this.toast.success(`Pago de ${this.repair().code} actualizado.`);
      this.saved.emit();
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo actualizar el pago'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const p = this.payment();
    const ok = await this.confirm.ask({
      title: '¿Eliminar este pago?',
      message: `Se eliminará el pago de $${p.amount.toLocaleString('es-CO')} de ${this.repair().code} y su saldo volverá a aumentar. Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.paymentService.delete(p);
      this.toast.success(`Pago de ${this.repair().code} eliminado.`);
      this.saved.emit();
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo eliminar el pago'));
    } finally {
      this.busy.set(false);
    }
  }

  protected onEscape(): void {
    // Con el diálogo de confirmación abierto, Escape solo cierra ese diálogo.
    if (!this.confirm.current() && !this.busy()) this.closed.emit();
  }
}
