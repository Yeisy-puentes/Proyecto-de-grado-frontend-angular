import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client, ClientFormData } from '../../core/models/client.model';
import {
  PAYMENT_METHODS,
  PaymentMethod,
  Repair,
  RepairFormData,
  RepairStatus,
} from '../../core/models/repair.model';
import { ClientService } from '../../core/services/client.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { PaymentService } from '../../core/services/payment.service';
import { RepairService } from '../../core/services/repair.service';
import { ToastService } from '../../core/services/toast.service';
import { fromDateKey, nowTime, todayKey } from '../../core/utils/date.utils';
import { apiErrorMessage } from '../../core/utils/http-error';
import { ClientFormModal } from '../../shared/components/client-form-modal/client-form-modal';
import { FieldError } from '../../shared/forms/field-error/field-error';
import { FormValidation } from '../../shared/forms/form-validation.directive';
import { PaymentMethodSelector } from '../../shared/components/payment-method-selector/payment-method-selector';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { CopCurrencyPipe } from '../../shared/pipes/cop-currency.pipe';
import { Time12Pipe } from '../../shared/pipes/time12.pipe';

type StatusFilter = RepairStatus | 'all';

/** Hora de entrega que se propone por defecto (5:30 p. m.); se puede cambiar en el formulario. */
const DEFAULT_DELIVERY_TIME = '17:30';

interface RepairForm extends Omit<RepairFormData, 'clientId'> {
  /** Abono inicial (solo al crear; luego los pagos se registran en el detalle del cliente). */
  initialPayment: number;
  paymentMethod: PaymentMethod | null;
}

function emptyForm(): RepairForm {
  return {
    description: '',
    status: 'pendiente',
    receivedDate: todayKey(),
    receivedTime: nowTime(),
    deliveryDate: '',
    deliveryTime: DEFAULT_DELIVERY_TIME,
    cost: 0,
    initialPayment: 0,
    paymentMethod: null,
  };
}

@Component({
  selector: 'app-repairs',
  imports: [FormsModule, DatePipe, CopCurrencyPipe, Time12Pipe, StatusBadge, PaymentMethodSelector, ClientFormModal, FieldError, FormValidation],
  templateUrl: './repairs.html',
  styleUrl: './repairs.css',
})
export class Repairs implements OnInit, OnDestroy {
  private readonly repairService = inject(RepairService);
  private readonly clientService = inject(ClientService);
  private readonly paymentService = inject(PaymentService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly clients = this.clientService.clients;
  protected readonly loading = this.repairService.loading;
  protected readonly fromDateKey = fromDateKey;

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([this.repairService.load(), this.clientService.load(), this.paymentService.load()]);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudieron cargar los arreglos'));
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
  }

  // ---------- Filtros ----------
  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly clientFilter = signal<number | 'all'>('all');
  protected readonly dateFilter = signal('');
  protected readonly showAdvancedFilters = signal(false);

  protected readonly pillFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'pendiente', label: 'Pendientes' },
    { value: 'en_proceso', label: 'En Proceso' },
    { value: 'listo', label: 'Listos' },
  ];

  protected readonly filteredRepairs = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const clientId = this.clientFilter();
    const date = this.dateFilter();

    return this.repairService.repairs().filter((r) => {
      const matchesSearch =
        !term ||
        [r.code, String(r.id), r.clientName, r.clientCedula, r.description].some((value) =>
          value.toLowerCase().includes(term),
        );
      const matchesStatus = status === 'all' || r.status === status;
      const matchesClient = clientId === 'all' || r.clientId === clientId;
      const matchesDate = !date || r.deliveryDate === date;
      return matchesSearch && matchesStatus && matchesClient && matchesDate;
    });
  });

  protected countByStatus(status: StatusFilter): number {
    return status === 'all'
      ? this.repairService.repairs().length
      : this.repairService.repairs().filter((r) => r.status === status).length;
  }

  /** Método del último pago registrado para el arreglo. */
  protected lastMethod(repair: Repair): PaymentMethod | null {
    return this.paymentService.lastMethodByRepair().get(repair.id)?.method ?? null;
  }

  protected paymentLabel(method: PaymentMethod): string {
    return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
  }

  protected paidPercent(repair: Repair): number {
    return repair.cost > 0 ? Math.round((repair.paid / repair.cost) * 100) : 0;
  }

  protected onClientFilterChange(value: string): void {
    this.clientFilter.set(value === 'all' ? 'all' : Number(value));
  }

  // ---------- Modal nuevo / editar arreglo ----------
  protected readonly repairModalOpen = signal(false);
  protected readonly editing = signal<Repair | null>(null);
  protected readonly saving = signal(false);
  protected form: RepairForm = emptyForm();

  protected readonly clientQuery = signal('');
  protected readonly selectedClient = signal<Pick<Client, 'id' | 'name' | 'cedula' | 'phone'> | null>(null);
  protected readonly clientSuggestions = signal<Client[]>([]);
  protected readonly searchingClients = signal(false);
  private searchTimer?: ReturnType<typeof setTimeout>;

  protected openNewRepair(): void {
    this.editing.set(null);
    this.form = emptyForm();
    this.selectedClient.set(null);
    this.clientQuery.set('');
    this.clientSuggestions.set([]);
    this.repairModalOpen.set(true);
  }

  protected openEditRepair(repair: Repair): void {
    this.editing.set(repair);
    this.form = {
      description: repair.description,
      status: repair.status,
      receivedDate: repair.receivedDate,
      receivedTime: repair.receivedTime ?? '',
      deliveryDate: repair.deliveryDate ?? '',
      deliveryTime: repair.deliveryTime ?? DEFAULT_DELIVERY_TIME,
      cost: repair.cost,
      initialPayment: 0,
      paymentMethod: null,
    };
    this.selectedClient.set({
      id: repair.clientId,
      name: repair.clientName,
      cedula: repair.clientCedula,
      phone: repair.clientPhone,
    });
    this.clientQuery.set('');
    this.clientSuggestions.set([]);
    this.repairModalOpen.set(true);
  }

  protected closeRepairModal(): void {
    this.repairModalOpen.set(false);
  }

  /** Autocompletar contra GET /clientes?buscar= (con pausa de 300 ms entre teclas). */
  protected onClientQueryChange(value: string): void {
    this.clientQuery.set(value);
    this.selectedClient.set(null);
    clearTimeout(this.searchTimer);

    const term = value.trim();
    if (term.length < 2) {
      this.clientSuggestions.set([]);
      this.searchingClients.set(false);
      return;
    }
    // "Buscando..." desde que se escribe (no solo cuando sale la petición), para no mostrar "0 coincidencias" durante la pausa.
    this.searchingClients.set(true);
    this.searchTimer = setTimeout(async () => {
      try {
        const results = await this.clientService.search(term);
        if (this.clientQuery().trim() === term) this.clientSuggestions.set(results);
      } catch (err) {
        this.toast.error(apiErrorMessage(err, 'No se pudo buscar el cliente'));
      } finally {
        if (this.clientQuery().trim() === term) this.searchingClients.set(false);
      }
    }, 300);
  }

  protected selectClient(client: Pick<Client, 'id' | 'name' | 'cedula' | 'phone'>): void {
    this.selectedClient.set(client);
    this.clientQuery.set('');
    this.clientSuggestions.set([]);
  }

  protected async submitRepair(): Promise<void> {
    const client = this.selectedClient();
    if (!client) {
      this.toast.error('Selecciona un cliente para el arreglo.');
      return;
    }
    if (this.form.deliveryDate && this.form.deliveryDate < this.form.receivedDate) {
      this.toast.error('La fecha de entrega no puede ser anterior a la fecha de recepción.');
      return;
    }
    if (
      this.form.deliveryDate === this.form.receivedDate &&
      this.form.receivedTime &&
      this.form.deliveryTime &&
      this.form.deliveryTime < this.form.receivedTime
    ) {
      this.toast.error('La hora de entrega no puede ser anterior a la hora de recepción el mismo día.');
      return;
    }
    const editingRepair = this.editing();
    if (editingRepair && Number(this.form.cost) < editingRepair.paid) {
      this.toast.error('El costo total no puede ser menor a lo que ya se ha pagado.');
      return;
    }
    const initialPayment = Number(this.form.initialPayment) || 0;
    if (!this.editing() && initialPayment > 0) {
      if (!this.form.paymentMethod) {
        this.toast.error('Selecciona el método de pago del abono.');
        return;
      }
      if (initialPayment > Number(this.form.cost)) {
        this.toast.error('El abono no puede ser mayor al costo total.');
        return;
      }
    }

    const data: RepairFormData = {
      clientId: client.id,
      description: this.form.description,
      status: this.form.status,
      receivedDate: this.form.receivedDate,
      receivedTime: this.form.receivedTime,
      deliveryDate: this.form.deliveryDate,
      deliveryTime: this.form.deliveryDate ? this.form.deliveryTime : '',
      cost: Number(this.form.cost) || 0,
    };

    this.saving.set(true);
    try {
      const editing = this.editing();
      if (editing) {
        const { repair, email } = await this.repairService.update(editing.id, data);
        this.toast.success(`Arreglo ${repair.code} actualizado.`);
        if (email) {
          email.enviado
            ? this.toast.info(`Se notificó por correo a ${repair.clientName} que su arreglo está listo.`)
            : this.toast.error(`No se envió el correo: ${email.motivo ?? 'motivo desconocido'}.`);
        }
      } else {
        const repair = await this.repairService.create(data);
        if (initialPayment > 0 && this.form.paymentMethod) {
          await this.paymentService.create(repair.id, initialPayment, this.form.paymentMethod);
        }
        this.toast.success(`Arreglo ${repair.code} registrado.`);
      }
      this.repairModalOpen.set(false);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo guardar el arreglo'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async deleteRepair(repair: Repair): Promise<void> {
    const ok = await this.confirm.ask({
      title: `¿Eliminar el arreglo ${repair.code}?`,
      message: `Se eliminará el arreglo de ${repair.clientName} junto con sus pagos registrados. Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    try {
      await this.repairService.delete(repair.id);
      this.toast.success(`Arreglo ${repair.code} eliminado.`);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo eliminar el arreglo'));
    }
  }

  // ---------- Modal nuevo cliente (desde arreglos) ----------
  protected readonly newClientModalOpen = signal(false);

  protected async createClient(data: ClientFormData): Promise<void> {
    try {
      const client = await this.clientService.create(data);
      this.selectClient(client);
      this.newClientModalOpen.set(false);
      this.toast.success(`Cliente ${client.name} creado.`);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo crear el cliente'));
    }
  }
}
