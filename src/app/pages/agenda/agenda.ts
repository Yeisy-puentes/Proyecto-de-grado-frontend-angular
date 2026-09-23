import { DatePipe, TitleCasePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { REMINDER_COLORS, Reminder, ReminderColor } from '../../core/models/reminder.model';
import { Repair, RepairStatus, STATUS_LABELS, statusClass } from '../../core/models/repair.model';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReminderService } from '../../core/services/reminder.service';
import { RepairService } from '../../core/services/repair.service';
import { ToastService } from '../../core/services/toast.service';
import { fromDateKey, toDateKey } from '../../core/utils/date.utils';
import { apiErrorMessage } from '../../core/utils/http-error';
import { CopCurrencyPipe } from '../../shared/pipes/cop-currency.pipe';
import { Time12Pipe } from '../../shared/pipes/time12.pipe';
import { FieldError } from '../../shared/forms/field-error/field-error';
import { FormValidation } from '../../shared/forms/form-validation.directive';

type AgendaView = 'month' | 'day';
type DayFilter = 'all' | 'pendiente' | 'en_proceso' | 'listo' | 'recordatorio';
/** Estados que se muestran en la agenda (los entregados ya no son compromisos). */
type AgendaStatus = Exclude<RepairStatus, 'entregado'>;

interface CalendarDay {
  key: string;
  day: number;
  isOutside: boolean;
  isToday: boolean;
  events: { type: AgendaStatus | 'recordatorio'; count: number; label: string }[];
}

/** Los arreglos solo tienen fecha de entrega (sin hora): van primero, luego los recordatorios por hora. */
type DayEvent = { kind: 'repair'; time: string; repair: Repair } | { kind: 'reminder'; time: string; reminder: Reminder };

const EVENT_LABELS: Record<AgendaStatus | 'recordatorio', [string, string]> = {
  pendiente: ['pendiente', 'pendientes'],
  en_proceso: ['en proceso', 'en proceso'],
  listo: ['listo', 'listos'],
  recordatorio: ['recordatorio', 'recordatorios'],
};

@Component({
  selector: 'app-agenda',
  imports: [FormsModule, DatePipe, TitleCasePipe, CopCurrencyPipe, Time12Pipe, FieldError, FormValidation],
  templateUrl: './agenda.html',
  styleUrl: './agenda.css',
})
export class Agenda implements OnInit {
  private readonly repairService = inject(RepairService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly reminderService = inject(ReminderService);

  protected readonly statusClass = statusClass;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  protected readonly reminderColors = REMINDER_COLORS;

  private readonly today = new Date();
  private readonly todayKey = toDateKey(this.today);

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([this.repairService.load(), this.reminderService.load()]);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo cargar la agenda'));
    }
  }

  protected readonly view = signal<AgendaView>('month');
  /** Primer día del mes visible. */
  protected readonly currentMonth = signal(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
  /** Día seleccionado en la vista de día (yyyy-MM-dd). */
  protected readonly selectedDate = signal(this.todayKey);
  protected readonly dayFilter = signal<DayFilter>('all');

  /** Arreglos que siguen activos (no entregados), con datos del cliente. */
  private readonly agendaRepairs = computed(() =>
    this.repairService.repairs().filter((r) => r.status !== 'entregado' && r.deliveryDate),
  );

  // ---------- Vista de mes ----------
  protected readonly monthDeliveries = computed(() => {
    const month = this.currentMonth();
    const prefix = toDateKey(month).slice(0, 7); // yyyy-MM
    return this.repairService.repairs().filter((r) => r.deliveryDate?.startsWith(prefix)).length;
  });

  protected readonly calendarDays = computed<CalendarDay[]>(() => {
    const month = this.currentMonth();
    const start = new Date(month);
    start.setDate(1 - month.getDay()); // retrocede hasta el domingo anterior

    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key = toDateKey(date);
      return {
        key,
        day: date.getDate(),
        isOutside: date.getMonth() !== month.getMonth(),
        isToday: key === this.todayKey,
        events: this.eventSummary(key),
      };
    });
  });

  private eventSummary(key: string): CalendarDay['events'] {
    const repairs = this.agendaRepairs().filter((r) => r.deliveryDate === key);
    const reminders = this.reminderService.reminders().filter((r) => r.date === key);
    const types: (AgendaStatus | 'recordatorio')[] = ['pendiente', 'en_proceso', 'listo', 'recordatorio'];

    return types
      .map((type) => {
        const count = type === 'recordatorio' ? reminders.length : repairs.filter((r) => r.status === type).length;
        return { type, count, label: `${count} ${EVENT_LABELS[type][count === 1 ? 0 : 1]}` };
      })
      .filter((e) => e.count > 0);
  }

  // ---------- Vista de día ----------
  private readonly allDayEvents = computed<DayEvent[]>(() => {
    const key = this.selectedDate();
    const repairs: DayEvent[] = this.agendaRepairs()
      .filter((r) => r.deliveryDate === key)
      .map((repair) => ({ kind: 'repair', time: repair.deliveryTime ?? '', repair }));
    const reminders: DayEvent[] = this.reminderService
      .reminders()
      .filter((r) => r.date === key)
      .map((reminder) => ({ kind: 'reminder', time: reminder.time, reminder }));
    return [...repairs, ...reminders].sort((a, b) => a.time.localeCompare(b.time));
  });

  protected readonly dayEvents = computed(() => {
    const filter = this.dayFilter();
    return this.allDayEvents().filter((e) => {
      if (filter === 'all') return true;
      if (filter === 'recordatorio') return e.kind === 'reminder';
      return e.kind === 'repair' && e.repair.status === filter;
    });
  });

  protected readonly dayFilters = computed(() => {
    const events = this.allDayEvents();
    const countRepairs = (status: AgendaStatus) =>
      events.filter((e) => e.kind === 'repair' && e.repair.status === status).length;
    return [
      { value: 'pendiente' as const, label: 'Pendiente', dot: 'pendiente', count: countRepairs('pendiente') },
      { value: 'en_proceso' as const, label: 'En Taller', dot: 'en-proceso', count: countRepairs('en_proceso') },
      { value: 'listo' as const, label: 'Listo', dot: 'listo', count: countRepairs('listo') },
      {
        value: 'recordatorio' as const,
        label: 'Recordatorios',
        dot: 'recordatorio',
        count: events.filter((e) => e.kind === 'reminder').length,
      },
    ];
  });

  /** Totales del día (sin filtro) para el subtítulo "X entrega(s) · Y recordatorio(s)". */
  protected readonly dayCounts = computed(() => {
    const events = this.allDayEvents();
    return {
      repairs: events.filter((e) => e.kind === 'repair').length,
      reminders: events.filter((e) => e.kind === 'reminder').length,
    };
  });

  protected readonly activeFilterLabel = computed(
    () => this.dayFilters().find((f) => f.value === this.dayFilter())?.label ?? '',
  );

  // ---------- Tarjetas de arreglo (vista día) ----------
  protected readonly expandedRepairId = signal<number | null>(null);
  protected readonly changingId = signal<number | null>(null);

  protected toggleRepair(id: number): void {
    this.expandedRepairId.update((current) => (current === id ? null : id));
  }

  protected paidPercent(repair: Repair): number {
    return repair.cost > 0 ? Math.min((repair.paid / repair.cost) * 100, 100) : 0;
  }

  /** "Pasar a Taller" / "Marcar Listo". Al pasar a Listo el backend envía el correo al cliente. */
  protected async changeStatus(repair: Repair, status: 'en_proceso' | 'listo'): Promise<void> {
    this.changingId.set(repair.id);
    try {
      const { email } = await this.repairService.changeStatus(repair.id, status);
      this.toast.success(`Arreglo marcado como "${STATUS_LABELS[status]}"`);
      if (email) {
        email.enviado
          ? this.toast.info(`Se notificó por correo a ${repair.clientName}.`)
          : this.toast.error(`No se envió el correo: ${email.motivo ?? 'motivo desconocido'}.`);
      }
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo cambiar el estado'));
    } finally {
      this.changingId.set(null);
    }
  }

  /** Fecha seleccionada como Date local (para el DatePipe). */
  protected readonly selectedDateValue = computed(() => fromDateKey(this.selectedDate()));

  // ---------- Navegación ----------
  protected setView(view: AgendaView): void {
    this.view.set(view);
  }

  protected openDay(key: string): void {
    this.selectedDate.set(key);
    this.dayFilter.set('all');
    this.view.set('day');
  }

  protected prev(): void {
    this.move(-1);
  }

  protected next(): void {
    this.move(1);
  }

  protected goToday(): void {
    this.currentMonth.set(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
    this.selectedDate.set(this.todayKey);
  }

  private move(step: number): void {
    if (this.view() === 'month') {
      this.currentMonth.update((m) => new Date(m.getFullYear(), m.getMonth() + step, 1));
    } else {
      const d = this.selectedDateValue();
      const nextDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step);
      this.selectedDate.set(toDateKey(nextDay));
      this.currentMonth.set(new Date(nextDay.getFullYear(), nextDay.getMonth(), 1));
    }
  }

  // ---------- Recordatorios ----------
  protected readonly reminderModalOpen = signal(false);
  protected reminderForm = { title: '', description: '', date: '', time: '09:00', color: 'blue' as ReminderColor };

  protected openReminderModal(): void {
    this.reminderForm = { title: '', description: '', date: this.selectedDate(), time: '09:00', color: 'blue' };
    this.reminderModalOpen.set(true);
  }

  protected readonly savingReminder = signal(false);

  protected async saveReminder(): Promise<void> {
    this.savingReminder.set(true);
    try {
      await this.reminderService.create({ ...this.reminderForm });
      this.reminderModalOpen.set(false);
      this.toast.success('Recordatorio guardado');
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo guardar el recordatorio'));
    } finally {
      this.savingReminder.set(false);
    }
  }

  protected async deleteReminder(reminder: Reminder): Promise<void> {
    const ok = await this.confirm.ask({
      title: '¿Eliminar recordatorio?',
      message: `Se eliminará "${reminder.title}" de la agenda. Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    try {
      await this.reminderService.delete(reminder.id);
      this.toast.success('Recordatorio eliminado');
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo eliminar el recordatorio'));
    }
  }
}
