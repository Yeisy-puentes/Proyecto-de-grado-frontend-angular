import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client } from '../../../core/models/client.model';
import { DEFAULT_PAYMENT_METHOD, PaymentMethod, Repair } from '../../../core/models/repair.model';
import { PaymentService } from '../../../core/services/payment.service';
import { RepairService } from '../../../core/services/repair.service';
import { ToastService } from '../../../core/services/toast.service';
import { nowTime, todayKey } from '../../../core/utils/date.utils';
import { apiErrorMessage } from '../../../core/utils/http-error';
import { FieldError } from '../../forms/field-error/field-error';
import { FormValidation } from '../../forms/form-validation.directive';
import { PaymentMethodSelector } from '../payment-method-selector/payment-method-selector';

/** Hora de entrega que se propone por defecto (5:30 p. m.), igual que en Arreglos. */
const DEFAULT_DELIVERY_TIME = '17:30';

/**
 * Modal para registrar un arreglo nuevo de un cliente ya conocido (detalle del cliente).
 * Mismos campos y validaciones que "Nuevo Arreglo" en Arreglos, sin la búsqueda de cliente.
 */
@Component({
  selector: 'app-new-repair-modal',
  imports: [FormsModule, FieldError, FormValidation, PaymentMethodSelector],
  templateUrl: './new-repair-modal.html',
  styleUrl: './new-repair-modal.css',
})
export class NewRepairModal {
  private readonly repairService = inject(RepairService);
  private readonly paymentService = inject(PaymentService);
  private readonly toast = inject(ToastService);

  readonly client = input.required<Client>();
  readonly created = output<Repair>();
  readonly close = output<void>();

  protected readonly saving = signal(false);
  protected form = {
    description: '',
    receivedDate: todayKey(),
    receivedTime: nowTime(),
    deliveryDate: '',
    deliveryTime: DEFAULT_DELIVERY_TIME,
    cost: 0,
    initialPayment: 0,
    paymentMethod: DEFAULT_PAYMENT_METHOD as PaymentMethod | null,
  };

  protected async submit(): Promise<void> {
    const f = this.form;
    if (f.deliveryDate && f.deliveryDate < f.receivedDate) {
      this.toast.error('La fecha de entrega no puede ser anterior a la fecha de recepción.');
      return;
    }
    if (f.deliveryDate === f.receivedDate && f.receivedTime && f.deliveryTime && f.deliveryTime < f.receivedTime) {
      this.toast.error('La hora de entrega no puede ser anterior a la hora de recepción el mismo día.');
      return;
    }
    const initialPayment = Number(f.initialPayment) || 0;
    if (initialPayment > 0) {
      if (!f.paymentMethod) {
        this.toast.error('Selecciona el método de pago del abono.');
        return;
      }
      if (initialPayment > Number(f.cost)) {
        this.toast.error('El abono no puede ser mayor al costo total.');
        return;
      }
    }

    this.saving.set(true);
    try {
      // Al crear, el arreglo siempre empieza "Pendiente".
      let repair = await this.repairService.create({
        clientId: this.client().id,
        description: f.description,
        status: 'pendiente',
        receivedDate: f.receivedDate,
        receivedTime: f.receivedTime,
        deliveryDate: f.deliveryDate,
        deliveryTime: f.deliveryDate ? f.deliveryTime : '',
        cost: Number(f.cost) || 0,
      });
      if (initialPayment > 0 && f.paymentMethod) {
        await this.paymentService.create(repair.id, initialPayment, f.paymentMethod);
        repair = this.repairService.repairs().find((r) => r.id === repair.id) ?? repair;
      }
      this.toast.success(`Arreglo ${repair.code} registrado.`);
      this.created.emit(repair);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo guardar el arreglo'));
    } finally {
      this.saving.set(false);
    }
  }
}
