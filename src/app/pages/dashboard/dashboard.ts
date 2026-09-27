import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { REPAIR_STATUSES, RepairStatus, statusClass } from '../../core/models/repair.model';
import { ClientService } from '../../core/services/client.service';
import { RepairService } from '../../core/services/repair.service';
import { ToastService } from '../../core/services/toast.service';
import { fromDateKey, todayKey } from '../../core/utils/date.utils';
import { apiErrorMessage } from '../../core/utils/http-error';
import { LineChart } from '../../shared/components/charts/line-chart/line-chart';
import { CopCurrencyPipe } from '../../shared/pipes/cop-currency.pipe';

/** En el dashboard "en_proceso" se muestra como "En Proceso". */
const DASHBOARD_STATUS_LABELS: Record<RepairStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En Proceso',
  listo: 'Listo',
  entregado: 'Entregado',
};

/** Mismos tonos que los puntos de estado (un poco más oscuros para que la línea se vea bien). */
const STATUS_CHART_COLORS: Record<RepairStatus, string> = {
  pendiente: '#eab308',
  en_proceso: '#3b82f6',
  listo: '#22c55e',
  entregado: '#64748b',
};

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, CopCurrencyPipe, LineChart],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly repairService = inject(RepairService);
  private readonly clientService = inject(ClientService);
  private readonly toast = inject(ToastService);

  protected readonly statusClass = statusClass;
  protected readonly fromDateKey = fromDateKey;
  protected readonly loading = this.repairService.loading;

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([this.repairService.load(), this.clientService.load()]);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo cargar el dashboard'));
    }
  }

  protected readonly activeRepairs = computed(
    () => this.repairService.repairs().filter((r) => r.status === 'pendiente' || r.status === 'en_proceso').length,
  );

  protected readonly deliveriesToday = computed(() => {
    const today = todayKey();
    return this.repairService.repairs().filter((r) => r.status !== 'entregado' && r.deliveryDate === today).length;
  });

  protected readonly totalRevenue = computed(() =>
    this.repairService.repairs().reduce((sum, r) => sum + r.paid, 0),
  );

  protected readonly totalClients = computed(() => this.clientService.clients().length);

  protected readonly statusSummary = computed(() =>
    REPAIR_STATUSES.map((status) => ({
      status,
      label: DASHBOARD_STATUS_LABELS[status],
      count: this.repairService.repairs().filter((r) => r.status === status).length,
    })),
  );

  /** Estado cuya gráfica se muestra; cambia al pasar el mouse por la lista (por defecto, pendientes). */
  protected readonly activeStatus = signal<RepairStatus>('pendiente');

  /**
   * Arreglos del estado activo agrupados por mes (últimos 6 meses).
   * Los entregados se agrupan por fecha de entrega; el resto por fecha de ingreso.
   */
  protected readonly statusChart = computed(() => {
    const status = this.activeStatus();
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
    const counts = new Map<string, number>();
    for (const r of this.repairService.repairs()) {
      if (r.status !== status) continue;
      const date = status === 'entregado' ? (r.deliveryDate ?? r.receivedDate) : r.receivedDate;
      const key = date.slice(0, 7);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const points = months.map((d) => {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { label: MONTH_LABELS[d.getMonth()], value: counts.get(key) ?? 0 };
    });
    return {
      status,
      label: DASHBOARD_STATUS_LABELS[status],
      color: STATUS_CHART_COLORS[status],
      basis: status === 'entregado' ? 'por mes de entrega' : 'por mes de ingreso',
      total: points.reduce((sum, p) => sum + p.value, 0),
      points,
    };
  });

  /** Próximas entregas: arreglos no entregados con fecha de entrega, de la más cercana a la más lejana. */
  protected readonly upcomingDeliveries = computed(() =>
    this.repairService
      .repairs()
      .filter((r) => r.status !== 'entregado' && r.deliveryDate)
      .sort((a, b) => a.deliveryDate!.localeCompare(b.deliveryDate!))
      .slice(0, 5),
  );
}
