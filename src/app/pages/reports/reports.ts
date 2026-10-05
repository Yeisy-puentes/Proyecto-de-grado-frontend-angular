import { DatePipe, formatDate } from '@angular/common';
import { Component, OnInit, computed, inject, linkedSignal, signal } from '@angular/core';
import {
  ApiConteoEstado,
  ApiReporteArreglos,
  ApiReporteClientes,
  ApiReporteIngresos,
  ApiReporteResumen,
  ReportType,
} from '../../core/models/api.model';
import {
  REPAIR_STATUSES,
  RepairStatus,
  STATUS_COLORS,
  STATUS_LABELS,
  repairCode,
  toKey,
} from '../../core/models/repair.model';
import { ReportService } from '../../core/services/report.service';
import { ToastService } from '../../core/services/toast.service';
import { fromDateKey, fromMonthKey, toDateKey, todayKey } from '../../core/utils/date.utils';
import { apiErrorMessage } from '../../core/utils/http-error';
import { BarChart, BarSeries } from '../../shared/components/charts/bar-chart/bar-chart';
import { HBarChart } from '../../shared/components/charts/hbar-chart/hbar-chart';
import { ChartPoint, LineChart } from '../../shared/components/charts/line-chart/line-chart';
import { Pagination, paginate } from '../../shared/components/pagination/pagination';
import { CopCurrencyPipe } from '../../shared/pipes/cop-currency.pipe';

type ReportTab = 'summary' | 'income' | 'repairs' | 'clients';

/** Registros por página en las tablas de informes. */
const REPORT_PAGE_SIZE = 10;
type Preset = 'month' | '3months' | 'year';

const TAB_TO_REPORT: Record<ReportTab, ReportType> = {
  summary: 'resumen',
  income: 'ingresos',
  repairs: 'arreglos',
  clients: 'clientes',
};

function presetStart(preset: Preset, today = new Date()): Date {
  if (preset === 'month') return new Date(today.getFullYear(), today.getMonth(), 1);
  if (preset === '3months') return new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
  return new Date(today.getFullYear(), 0, 1);
}

function monthLabel(month: string): string {
  return formatDate(fromMonthKey(month), 'MMM yy', 'es');
}

@Component({
  selector: 'app-reports',
  imports: [DatePipe, CopCurrencyPipe, LineChart, BarChart, HBarChart, Pagination],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class Reports implements OnInit {
  private readonly reportService = inject(ReportService);
  private readonly toast = inject(ToastService);

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly statusColors = STATUS_COLORS;
  protected readonly repairCode = repairCode;
  protected readonly formatMoney = (v: number) => `$${Math.round(v).toLocaleString('es-CO')}`;

  protected readonly activeTab = signal<ReportTab>('summary');
  protected readonly tabs: { value: ReportTab; label: string }[] = [
    { value: 'summary', label: 'Resumen General' },
    { value: 'income', label: 'Ingresos' },
    { value: 'repairs', label: 'Arreglos' },
    { value: 'clients', label: 'Clientes' },
  ];

  // ---------- Período ----------
  protected readonly dateFrom = signal(toDateKey(presetStart('3months')));
  protected readonly dateTo = signal(todayKey());
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);

  // ---------- Respuestas del backend ----------
  protected readonly resumen = signal<ApiReporteResumen | null>(null);
  protected readonly ingresos = signal<ApiReporteIngresos | null>(null);
  protected readonly arreglos = signal<ApiReporteArreglos | null>(null);
  protected readonly clientes = signal<ApiReporteClientes | null>(null);

  ngOnInit(): void {
    this.loadReports();
  }

  protected setDateFrom(value: string): void {
    this.dateFrom.set(value);
    this.loadReports();
  }

  protected setDateTo(value: string): void {
    this.dateTo.set(value);
    this.loadReports();
  }

  protected applyPreset(preset: Preset): void {
    this.dateFrom.set(toDateKey(presetStart(preset)));
    this.dateTo.set(todayKey());
    this.loadReports();
  }

  /** GET /reportes/resumen, /ingresos, /arreglos y /clientes para el período seleccionado. */
  private async loadReports(): Promise<void> {
    const range = { desde: this.dateFrom(), hasta: this.dateTo() };
    if (range.desde && range.hasta && range.desde > range.hasta) {
      this.toast.error('La fecha inicial no puede ser mayor a la final.');
      return;
    }
    this.loading.set(true);
    try {
      const [resumen, ingresos, arreglos, clientes] = await Promise.all([
        this.reportService.getResumen(range),
        this.reportService.getIngresos(range),
        this.reportService.getArreglos(range),
        this.reportService.getClientes(range),
      ]);
      this.resumen.set(resumen);
      this.ingresos.set(ingresos);
      this.arreglos.set(arreglos);
      this.clientes.set(clientes);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudieron cargar los reportes'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async export(format: 'excel' | 'pdf'): Promise<void> {
    this.exporting.set(true);
    try {
      await this.reportService.download(format, TAB_TO_REPORT[this.activeTab()], {
        desde: this.dateFrom(),
        hasta: this.dateTo(),
      });
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo generar el archivo'));
    } finally {
      this.exporting.set(false);
    }
  }

  /** Fecha ISO del backend -> Date local (para el DatePipe). */
  protected day(value: string | null): Date | null {
    return value ? fromDateKey(toDateKey(value)) : null;
  }

  protected toDate(key: string): Date | null {
    return key ? fromDateKey(key) : null;
  }

  protected statusKey(name: string): RepairStatus {
    return toKey(name) as RepairStatus;
  }

  protected num(value: number | string | null | undefined): number {
    return Number(value ?? 0);
  }

  // ---------- Paginación de tablas ----------
  protected readonly reportPageSize = REPORT_PAGE_SIZE;

  /** Cambia con el rango de fechas o la pestaña: las tablas vuelven a la página 1. */
  private readonly pageResetKey = computed(() => `${this.dateFrom()}|${this.dateTo()}|${this.activeTab()}`);

  protected readonly incomeRows = computed(() => this.ingresos()?.detalle ?? []);
  protected readonly incomePage = linkedSignal({ source: this.pageResetKey, computation: () => 1 });
  protected readonly pagedIncomeRows = computed(() => paginate(this.incomeRows(), this.incomePage(), REPORT_PAGE_SIZE));

  protected readonly repairRows = computed(() => this.arreglos()?.listado ?? []);
  protected readonly repairsPage = linkedSignal({ source: this.pageResetKey, computation: () => 1 });
  protected readonly pagedRepairRows = computed(() => paginate(this.repairRows(), this.repairsPage(), REPORT_PAGE_SIZE));

  // ---------- KPIs ----------
  protected readonly totals = computed(() => {
    const t = this.resumen()?.totales;
    return {
      count: Number(t?.arreglos_periodo ?? 0),
      paid: Number(t?.cobrado ?? 0),
      pending: Number(t?.pendiente ?? 0),
      activeClients: Number(t?.clientes_activos ?? 0),
    };
  });

  // ---------- Distribución por estado (dona + recuadros) ----------
  protected readonly statusBreakdown = computed(() => this.breakdown(this.resumen()?.porEstado ?? []));

  private breakdown(rows: ApiConteoEstado[]) {
    const counts = new Map(rows.map((r) => [toKey(r.nombre_estado), Number(r.total)]));
    const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
    let accumulated = 0;
    return REPAIR_STATUSES.map((status) => {
      const count = counts.get(status) ?? 0;
      const percent = Math.round((count / total) * 100);
      // El círculo SVG empieza a las 3 en punto; el offset de 25 lo lleva a las 12.
      const segment = { status, count, percent, offset: 25 - accumulated };
      accumulated += percent;
      return segment;
    });
  }

  // ---------- Gráficas ----------
  protected readonly monthlyIncome = computed<ChartPoint[]>(() =>
    (this.resumen()?.ingresosPorMes ?? []).map((m) => ({ label: monthLabel(m.mes), value: Number(m.cobrado) })),
  );

  protected readonly incomeChart = computed(() => {
    const rows = this.ingresos()?.porMes ?? [];
    const series: BarSeries[] = [
      { name: 'Cobrado', color: 'var(--color-brand-blue)', values: rows.map((r) => Number(r.cobrado)) },
      { name: 'Pendiente', color: 'var(--color-orange-500)', values: rows.map((r) => Number(r.pendiente)) },
    ];
    return { labels: rows.map((r) => monthLabel(r.mes)), series };
  });

  protected readonly repairsChart = computed(() => {
    const rows = this.arreglos()?.porMes ?? [];
    const series: BarSeries[] = [{ name: 'Arreglos', color: 'var(--color-brand-navy-dark)', values: rows.map((r) => Number(r.total)) }];
    return { labels: rows.map((r) => monthLabel(r.mes)), series };
  });

  protected readonly topClients = computed(() =>
    (this.clientes()?.topClientes ?? []).map((c) => ({ label: c.nombre_completo, value: Number(c.total_arreglos) })),
  );
}
