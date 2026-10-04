import { DatePipe } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Client, ClientFormData } from '../../core/models/client.model';
import {
  PAYMENT_METHODS,
  PaymentMethod,
  REPAIR_STATUSES,
  Repair,
  RepairFormData,
  RepairStatus,
  STATUS_LABELS,
} from '../../core/models/repair.model';
import { ClientService } from '../../core/services/client.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { PaymentService } from '../../core/services/payment.service';
import { EmailNotification, RepairService } from '../../core/services/repair.service';
import { ToastService } from '../../core/services/toast.service';
import { fromDateKey, nowTime, todayKey } from '../../core/utils/date.utils';
import { apiErrorMessage } from '../../core/utils/http-error';
import { ClientFormModal } from '../../shared/components/client-form-modal/client-form-modal';
import { FieldError } from '../../shared/forms/field-error/field-error';
import { FormValidation } from '../../shared/forms/form-validation.directive';
import { autoPageSize } from '../../shared/components/pagination/auto-page-size';
import { Pagination, clampPage, paginate } from '../../shared/components/pagination/pagination';
import { PaymentMethodSelector } from '../../shared/components/payment-method-selector/payment-method-selector';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { CopCurrencyPipe } from '../../shared/pipes/cop-currency.pipe';
import { Time12Pipe } from '../../shared/pipes/time12.pipe';

type StatusFilter = RepairStatus | 'all';

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Minúsculas, sin tildes y con separadores unificados: "30 Sept, 2026" -> "30 sept 2026". */
function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formas en que se puede escribir una fecha en el buscador:
 * 2026-09-30, 30/09/2026, 30/9/2026, 30-09-2026, "30 sept 2026", "30 septiembre", "sept 2026"...
 */
function dateSearchKeys(dateKey: string | null): string[] {
  if (!dateKey) return [];
  const [y, m, d] = dateKey.split('-');
  const day = String(Number(d));
  const month = String(Number(m));
  const name = MONTH_NAMES[Number(m) - 1];
  const short = name.slice(0, 3);
  return [
    dateKey,
    `${d}/${m}/${y}`,
    `${day}/${month}/${y}`,
    `${d}-${m}-${y}`,
    `${day}-${month}-${y}`,
    `${day} ${name} ${y}`,
    `${day} ${short} ${y}`,
    `${day} ${name.slice(0, 4)} ${y}`, // "30 sept 2026", como lo muestra la tabla
    `${day} de ${name} de ${y}`,
  ];
}

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
  imports: [FormsModule, RouterLink, DatePipe, CopCurrencyPipe, Time12Pipe, StatusBadge, PaymentMethodSelector, ClientFormModal, FieldError, FormValidation, Pagination],
  templateUrl: './repairs.html',
  styleUrl: './repairs.css',
  host: {
    '(document:click)': 'closeStatusMenu()',
    '(document:keydown.escape)': 'onEscape()',
    '(window:resize)': 'closeStatusMenu()',
    '(window:wheel)': 'closeStatusMenu()',
  },
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

  protected readonly pillFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'pendiente', label: 'Pendientes' },
    { value: 'en_proceso', label: 'En Taller' },
    { value: 'listo', label: 'Listos' },
    { value: 'entregado', label: 'Entregados' },
  ];

  /**
   * Primero lo que falta por entregar, de la entrega más cercana a la más lejana (sin fecha al final);
   * después los entregados, del más reciente al más antiguo.
   */
  protected readonly filteredRepairs = computed(() => {
    const term = normalizeSearch(this.search());
    const status = this.statusFilter();

    const matches = this.repairService.repairs().filter((r) => {
      const matchesSearch =
        !term ||
        [r.code, String(r.id), r.clientName, r.clientCedula, ...dateSearchKeys(r.deliveryDate), ...dateSearchKeys(r.receivedDate)].some(
          (value) => normalizeSearch(value).includes(term),
        );
      return matchesSearch && (status === 'all' || r.status === status);
    });

    const active = matches
      .filter((r) => r.status !== 'entregado')
      .sort((a, b) => (a.deliveryDate ?? '9999').localeCompare(b.deliveryDate ?? '9999') || (a.deliveryTime ?? '').localeCompare(b.deliveryTime ?? ''));
    const delivered = matches
      .filter((r) => r.status === 'entregado')
      .sort((a, b) => (b.deliveryDate ?? b.receivedDate).localeCompare(a.deliveryDate ?? a.receivedDate) || b.id - a.id);
    return [...active, ...delivered];
  });

  // ---------- Paginación ----------
  /** Vuelve a la página 1 cada vez que cambia la búsqueda (texto o fecha) o el filtro por estado. */
  protected readonly page = linkedSignal({
    source: () => [this.search(), this.statusFilter()],
    computation: () => 1,
  });

  private readonly rowsBody = viewChild<ElementRef<HTMLElement>>('rowsBody');

  /** Filas que caben en pantalla sin desplazamiento (10 fijas en celular). */
  protected readonly pageSize = autoPageSize({
    items: this.filteredRepairs,
    page: this.page,
    list: this.rowsBody,
    itemSelector: 'tr.repair-row',
    reservedSelector: 'tr.group-row',
    needsReserved: () => this.firstDeliveredIndex() >= 0,
  });

  protected readonly pagedRepairs = computed(() => paginate(this.filteredRepairs(), this.page(), this.pageSize()));

  /** Posición en la lista filtrada del primer arreglo de la página actual. */
  protected readonly pageOffset = computed(
    () => (clampPage(this.page(), this.filteredRepairs().length, this.pageSize()) - 1) * this.pageSize(),
  );

  /** Índice del primer entregado en "Todos", para mostrar el separador "Entregados". */
  protected readonly firstDeliveredIndex = computed(() =>
    this.statusFilter() === 'all' ? this.filteredRepairs().findIndex((r) => r.status === 'entregado') : -1,
  );

  /** El calendario del buscador escribe la fecha elegida como dd/mm/aaaa. */
  protected onSearchDatePicked(value: string): void {
    if (!value) return;
    const [y, m, d] = value.split('-');
    this.search.set(`${d}/${m}/${y}`);
  }

  protected openDatePicker(input: HTMLInputElement): void {
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  }

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

  // ---------- Alertas de entrega y saldo ----------
  /** 'overdue' si ya pasó la fecha de entrega sin entregarse, 'today' si se entrega hoy. */
  protected deliveryAlert(repair: Repair): { kind: 'overdue' | 'today'; label: string } | null {
    if (repair.status === 'entregado' || !repair.deliveryDate) return null;
    const today = todayKey();
    if (repair.deliveryDate === today) return { kind: 'today', label: 'Entrega hoy' };
    if (repair.deliveryDate < today) {
      const days = Math.round((fromDateKey(today).getTime() - fromDateKey(repair.deliveryDate).getTime()) / 86_400_000);
      return { kind: 'overdue', label: days === 1 ? 'Atrasado 1 día' : `Atrasado ${days} días` };
    }
    return null;
  }

  /** Entregado pero con saldo pendiente: el cliente se llevó la prenda sin pagar todo. */
  protected hasDebt(repair: Repair): boolean {
    return repair.status === 'entregado' && repair.balance > 0;
  }

  /** Si se va a marcar como entregado con saldo, pide confirmación. */
  private async confirmDeliveryWithBalance(repair: Repair): Promise<boolean> {
    if (repair.balance <= 0) return true;
    return this.confirm.ask({
      title: 'Arreglo con saldo pendiente',
      message: `${repair.code} de ${repair.clientName} aún debe $${repair.balance.toLocaleString('es-CO')}. ¿Marcarlo como entregado de todas formas?`,
      confirmLabel: 'Entregar igual',
      tone: 'warning',
    });
  }

  // ---------- Cambio rápido de estado (clic en la etiqueta) ----------
  protected readonly statuses = REPAIR_STATUSES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly statusMenu = signal<{ repair: Repair; top: number; left: number } | null>(null);
  protected readonly changingStatusId = signal<number | null>(null);

  protected toggleStatusMenu(repair: Repair, event: MouseEvent): void {
    event.stopPropagation();
    if (this.statusMenu()?.repair.id === repair.id) {
      this.statusMenu.set(null);
      return;
    }
    // Posición fija para que el menú no quede recortado por el scroll horizontal de la tabla.
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const menuHeight = 180;
    const top = rect.bottom + 6 + menuHeight > window.innerHeight ? rect.top - menuHeight - 6 : rect.bottom + 6;
    this.statusMenu.set({ repair, top, left: rect.left });
  }

  protected onEscape(): void {
    if (this.statusMenu()) this.statusMenu.set(null);
    else if (!this.paymentRepair() && !this.repairModalOpen()) this.detailId.set(null);
  }

  protected closeStatusMenu(): void {
    this.statusMenu.set(null);
  }

  protected async changeStatus(repair: Repair, status: RepairStatus): Promise<void> {
    this.statusMenu.set(null);
    if (status === repair.status) return;
    if (status === 'entregado' && !(await this.confirmDeliveryWithBalance(repair))) return;

    this.changingStatusId.set(repair.id);
    try {
      const { repair: updated, email } = await this.repairService.changeStatus(repair.id, status);
      this.toast.success(`${updated.code} ahora está en "${STATUS_LABELS[status]}".`);
      this.notifyEmailResult(updated, email);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo cambiar el estado'));
    } finally {
      this.changingStatusId.set(null);
    }
  }

  private notifyEmailResult(repair: Repair, email: EmailNotification | null): void {
    if (!email) return;
    email.enviado
      ? this.toast.info(`Se notificó por correo a ${repair.clientName} que su arreglo está listo.`)
      : this.toast.error(`No se envió el correo: ${email.motivo ?? 'motivo desconocido'}.`);
  }

  // ---------- Modal registrar pago ----------
  protected readonly paymentRepair = signal<Repair | null>(null);
  protected readonly paymentAmount = signal('');
  protected readonly paymentMethod = signal<PaymentMethod | null>(null);
  protected readonly savingPayment = signal(false);

  protected openPayment(repair: Repair): void {
    this.paymentRepair.set(repair);
    this.paymentAmount.set('');
    this.paymentMethod.set(null);
  }

  protected closePayment(): void {
    this.paymentRepair.set(null);
  }

  /** Muestra el monto con separador de miles mientras se escribe (30000 -> 30.000). */
  protected onPaymentAmountInput(value: string): void {
    const digits = value.replace(/[^\d]/g, '');
    this.paymentAmount.set(digits ? Number(digits).toLocaleString('es-CO') : '');
  }

  protected payFullBalance(repair: Repair): void {
    this.paymentAmount.set(repair.balance.toLocaleString('es-CO'));
  }

  protected async submitPayment(): Promise<void> {
    const repair = this.paymentRepair();
    if (!repair) return;
    const amount = Number(this.paymentAmount().replace(/[^\d]/g, ''));
    const method = this.paymentMethod();
    if (!amount) {
      this.toast.error('Ingresa un monto válido.');
      return;
    }
    if (amount > repair.balance) {
      this.toast.error(`El pago no puede superar el saldo pendiente ($${repair.balance.toLocaleString('es-CO')}).`);
      return;
    }
    if (!method) {
      this.toast.error('Selecciona el método de pago.');
      return;
    }
    this.savingPayment.set(true);
    try {
      await this.paymentService.create(repair.id, amount, method);
      const remaining = repair.balance - amount;
      this.toast.success(
        remaining > 0
          ? `Pago de $${amount.toLocaleString('es-CO')} registrado en ${repair.code}. Saldo: $${remaining.toLocaleString('es-CO')}.`
          : `${repair.code} quedó pagado por completo.`,
      );
      this.paymentRepair.set(null);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo registrar el pago'));
    } finally {
      this.savingPayment.set(false);
    }
  }

  // ---------- Panel lateral de detalle ----------
  private readonly detailId = signal<number | null>(null);

  /** Se busca en la lista para que el panel se actualice solo al cambiar estado o registrar pagos. */
  protected readonly detailRepair = computed(() => {
    const id = this.detailId();
    return id === null ? null : (this.repairService.repairs().find((r) => r.id === id) ?? null);
  });

  protected readonly detailPayments = computed(() => {
    const id = this.detailId();
    return this.paymentService
      .payments()
      .filter((p) => p.repairId === id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  });

  protected readonly detailClient = computed(() => {
    const repair = this.detailRepair();
    return repair ? (this.clients().find((c) => c.id === repair.clientId) ?? null) : null;
  });

  protected openDetail(repair: Repair, event: MouseEvent): void {
    // Los botones de la fila (estado, pago, editar, eliminar) tienen su propia acción.
    if ((event.target as HTMLElement).closest('button, a')) return;
    this.statusMenu.set(null);
    this.detailId.set(repair.id);
  }

  protected closeDetail(): void {
    this.detailId.set(null);
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

    if (
      editingRepair &&
      data.status === 'entregado' &&
      editingRepair.status !== 'entregado' &&
      !(await this.confirmDeliveryWithBalance({ ...editingRepair, balance: data.cost - editingRepair.paid }))
    ) {
      return;
    }

    this.saving.set(true);
    try {
      const editing = this.editing();
      if (editing) {
        const { repair, email } = await this.repairService.update(editing.id, data);
        this.toast.success(`Arreglo ${repair.code} actualizado.`);
        this.notifyEmailResult(repair, email);
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
      if (this.detailId() === repair.id) this.detailId.set(null);
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
