import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, ClientFormData } from '../../core/models/client.model';
import { DEFAULT_PAYMENT_METHOD, Payment, PaymentMethod, Repair, RepairStatus } from '../../core/models/repair.model';
import { ClientService } from '../../core/services/client.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { PaymentService } from '../../core/services/payment.service';
import { RepairService } from '../../core/services/repair.service';
import { ToastService } from '../../core/services/toast.service';
import { fromDateKey } from '../../core/utils/date.utils';
import { apiErrorMessage } from '../../core/utils/http-error';
import { ClientFormModal } from '../../shared/components/client-form-modal/client-form-modal';
import { NewRepairModal } from '../../shared/components/new-repair-modal/new-repair-modal';
import { PaymentMethodSelector } from '../../shared/components/payment-method-selector/payment-method-selector';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { CopCurrencyPipe } from '../../shared/pipes/cop-currency.pipe';
import { Time12Pipe } from '../../shared/pipes/time12.pipe';

@Component({
  selector: 'app-client-detail',
  imports: [RouterLink, DatePipe, CopCurrencyPipe, Time12Pipe, StatusBadge, PaymentMethodSelector, ClientFormModal, NewRepairModal],
  templateUrl: './client-detail.html',
  styleUrl: './client-detail.css',
})
export class ClientDetail implements OnInit {
  private readonly clientService = inject(ClientService);
  private readonly repairService = inject(RepairService);
  private readonly paymentService = inject(PaymentService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  /** Parámetro de ruta :id (enlazado con withComponentInputBinding). */
  readonly id = input.required<string>();
  /** ?arreglo=ID (viene de "Entregar" en Arreglos): ese arreglo se abre al cargar. */
  readonly arreglo = input<string>();

  protected readonly fromDateKey = fromDateKey;
  protected readonly loading = signal(true);
  protected readonly client = signal<Client | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const [client] = await Promise.all([
        this.clientService.fetchById(Number(this.id())),
        this.repairService.load(),
      ]);
      this.client.set(client);
      // Si viene de "Entregar", se abre ese arreglo; si no, igual que en la maqueta,
      // el primer arreglo aún no entregado.
      const requested = this.clientRepairs().find((r) => r.id === Number(this.arreglo()));
      const toOpen = requested ?? this.clientRepairs().find((r) => r.status !== 'entregado');
      if (toOpen) this.expand(toOpen);
      if (requested) {
        setTimeout(() => document.getElementById(`repair-${requested.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo cargar el cliente'));
    } finally {
      this.loading.set(false);
    }
  }

  // ---------- Nuevo arreglo (modal en esta misma página) ----------
  protected readonly newRepairOpen = signal(false);

  /** Al registrarlo, se limpia el filtro y se abre el arreglo nuevo en el historial. */
  protected onRepairCreated(repair: Repair): void {
    this.newRepairOpen.set(false);
    this.searchId.set('');
    this.statusFilter.set('all');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.expand(repair);
    setTimeout(() => document.getElementById(`repair-${repair.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // ---------- Editar cliente ----------
  protected readonly editOpen = signal(false);

  protected async updateClient(data: ClientFormData): Promise<void> {
    const client = this.client();
    if (!client) return;
    try {
      this.client.set(await this.clientService.update(client.id, data));
      this.editOpen.set(false);
      this.toast.success('Cliente actualizado.');
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo actualizar el cliente'));
    }
  }

  protected readonly clientRepairs = computed(() =>
    this.repairService
      .repairs()
      .filter((r) => r.clientId === Number(this.id()))
      .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate) || b.id - a.id),
  );

  // ---------- Estadísticas ----------
  protected readonly stats = computed(() => {
    const repairs = this.clientRepairs();
    return {
      total: repairs.length,
      active: repairs.filter((r) => r.status !== 'entregado').length,
      spent: repairs.reduce((sum, r) => sum + r.cost, 0),
      pending: repairs.reduce((sum, r) => sum + r.balance, 0),
    };
  });

  // ---------- Filtros ----------
  protected readonly searchId = signal('');
  protected readonly statusFilter = signal<RepairStatus | 'all'>('all');
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');

  protected readonly filteredRepairs = computed(() => {
    const term = this.searchId().trim().toLowerCase();
    const status = this.statusFilter();
    const from = this.dateFrom();
    const to = this.dateTo();
    return this.clientRepairs().filter(
      (r) =>
        (!term || r.code.toLowerCase().includes(term) || String(r.id).includes(term)) &&
        (status === 'all' || r.status === status) &&
        (!from || r.receivedDate >= from) &&
        (!to || r.receivedDate <= to),
    );
  });

  // ---------- Panel expandido (pagos / entregar) ----------
  protected readonly expandedId = signal<number | null>(null);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly paymentAmount = signal('');
  protected readonly paymentMethod = signal<PaymentMethod | null>(DEFAULT_PAYMENT_METHOD);
  protected readonly busy = signal(false);

  protected toggleExpanded(repair: Repair): void {
    if (this.expandedId() === repair.id) {
      this.expandedId.set(null);
    } else {
      this.expand(repair);
    }
  }

  private async expand(repair: Repair): Promise<void> {
    this.expandedId.set(repair.id);
    this.paymentAmount.set('');
    this.paymentMethod.set(DEFAULT_PAYMENT_METHOD);
    this.payments.set([]);
    try {
      const payments = await this.paymentService.getByRepair(repair.id);
      if (this.expandedId() === repair.id) this.payments.set(payments);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudieron cargar los pagos'));
    }
  }

  protected payAll(repair: Repair): void {
    this.paymentAmount.set(String(repair.balance));
  }

  protected async registerPayment(repair: Repair): Promise<void> {
    const amount = Number(this.paymentAmount().replace(/[^\d]/g, ''));
    const method = this.paymentMethod();
    if (!amount || amount <= 0) {
      this.toast.error('Ingresa un monto válido.');
      return;
    }
    if (!method) {
      this.toast.error('Selecciona el método de pago.');
      return;
    }
    this.busy.set(true);
    try {
      const payment = await this.paymentService.create(repair.id, amount, method);
      this.payments.update((list) => [...list, payment]);
      this.paymentAmount.set('');
      this.paymentMethod.set(DEFAULT_PAYMENT_METHOD);
      this.toast.success(`Pago de $${amount.toLocaleString('es-CO')} registrado en ${repair.code}.`);
    } catch (err) {
      // El backend valida que el monto no supere el saldo pendiente.
      this.toast.error(apiErrorMessage(err, 'No se pudo registrar el pago'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async markDelivered(repair: Repair): Promise<void> {
    if (repair.balance > 0) {
      const ok = await this.confirm.ask({
        title: 'Arreglo con saldo pendiente',
        message: `${repair.code} aún debe $${repair.balance.toLocaleString('es-CO')}. ¿Marcarlo como entregado de todas formas?`,
        confirmLabel: 'Entregar',
        tone: 'warning',
      });
      if (!ok) return;
    }
    this.busy.set(true);
    try {
      await this.repairService.markDelivered(repair.id);
      this.expandedId.set(null);
      this.toast.success(`${repair.code} marcado como entregado.`);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo actualizar el arreglo'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async notifyReady(repair: Repair): Promise<void> {
    this.busy.set(true);
    try {
      const result = await this.repairService.notifyReady(repair.id);
      result.enviado
        ? this.toast.success('Correo de "arreglo listo" enviado al cliente.')
        : this.toast.error(`No se envió el correo: ${result.motivo ?? 'motivo desconocido'}.`);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo enviar la notificación'));
    } finally {
      this.busy.set(false);
    }
  }
}
