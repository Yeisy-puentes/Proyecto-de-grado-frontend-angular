import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { REPAIR_STATUSES, RepairStatus, statusClass } from '../../core/models/repair.model';
import { ClientService } from '../../core/services/client.service';
import { RepairService } from '../../core/services/repair.service';
import { ReportService } from '../../core/services/report.service';
import { ToastService } from '../../core/services/toast.service';
import { fromDateKey, toDateKey, todayKey } from '../../core/utils/date.utils';
import { apiErrorMessage } from '../../core/utils/http-error';
import { ChartPoint, LineChart } from '../../shared/components/charts/line-chart/line-chart';
import { CopCurrencyPipe } from '../../shared/pipes/cop-currency.pipe';

/** En el dashboard "en_proceso" se muestra como "En Proceso". */
const DASHBOARD_STATUS_LABELS: Record<RepairStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En Proceso',
  listo: 'Listo',
  entregado: 'Entregado',
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
  private readonly reportService = inject(ReportService);
  private readonly toast = inject(ToastService);

  protected readonly statusClass = statusClass;
  protected readonly fromDateKey = fromDateKey;
  protected readonly loading = this.repairService.loading;

  /** Ingresos cobrados de los últimos 6 meses (GET /reportes/resumen). */
  protected readonly revenueTrend = signal<ChartPoint[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([this.repairService.load(), this.clientService.load(), this.loadTrend()]);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo cargar el dashboard'));
    }
  }

  private async loadTrend(): Promise<void> {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
    const desde = toDateKey(months[0]);
    const resumen = await this.reportService.getResumen({ desde, hasta: todayKey() });
    const byMonth = new Map(resumen.ingresosPorMes.map((m) => [m.mes, Number(m.cobrado)]));
    this.revenueTrend.set(
      months.map((d) => {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return { label: MONTH_LABELS[d.getMonth()], value: byMonth.get(key) ?? 0 };
      }),
    );
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

  /** Próximas entregas: arreglos no entregados con fecha de entrega, de la más cercana a la más lejana. */
  protected readonly upcomingDeliveries = computed(() =>
    this.repairService
      .repairs()
      .filter((r) => r.status !== 'entregado' && r.deliveryDate)
      .sort((a, b) => a.deliveryDate!.localeCompare(b.deliveryDate!))
      .slice(0, 5),
  );
}
