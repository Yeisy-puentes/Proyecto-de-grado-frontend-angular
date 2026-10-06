import { DatePipe, NgTemplateOutlet, formatDate } from '@angular/common';
import { Component, DestroyRef, OnInit, Signal, computed, inject, linkedSignal, signal, untracked } from '@angular/core';
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
import { normalize } from '../../core/utils/text.utils';
import { BarChart, BarSeries } from '../../shared/components/charts/bar-chart/bar-chart';
import { DonutChart, DonutSegment } from '../../shared/components/charts/donut-chart/donut-chart';
import { HBarChart } from '../../shared/components/charts/hbar-chart/hbar-chart';
import { ChartPoint, LineChart } from '../../shared/components/charts/line-chart/line-chart';
import { Pagination, paginate } from '../../shared/components/pagination/pagination';
import { SearchBox } from '../../shared/components/search-box/search-box';
import { SelectDropdown } from '../../shared/components/select-dropdown/select-dropdown';
import { CopCurrencyPipe } from '../../shared/pipes/cop-currency.pipe';

type ReportTab = 'summary' | 'income' | 'repairs' | 'clients';

/** Registros por página en las tablas de informes. */
const REPORT_PAGE_SIZE = 10;
/** Espera tras la última tecla antes de filtrar (evita recalcular en cada pulsación). */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * Buscador con espera: `text` es lo que se ve en el input y `term` (sin espacios sobrantes)
 * se actualiza 200 ms después de dejar de escribir. Ambos se limpian cuando cambia `resetKey`
 * (rango de fechas o pestaña). Debe crearse en un contexto de inyección.
 */
function debouncedSearch(resetKey: Signal<string>) {
  const text = linkedSignal({ source: resetKey, computation: () => '' });
  const query = linkedSignal({ source: resetKey, computation: () => '' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  return {
    text: text.asReadonly(),
    term: computed(() => query().trim()),
    set(value: string): void {
      text.set(value);
      clearTimeout(timer);
      // Limpiar (botón ✕ o borrar todo) se aplica al instante.
      if (!value.trim()) {
        query.set('');
        return;
      }
      // Solo se aplica si el texto sigue igual (p. ej. no se limpió al cambiar de pestaña).
      timer = setTimeout(() => {
        if (untracked(text) === value) query.set(value);
      }, SEARCH_DEBOUNCE_MS);
    },
  };
}

/** Filas cuyo algún campo contiene el término, sin distinguir mayúsculas ni tildes. */
function filterRows<T>(rows: readonly T[], term: string, fields: (row: T) => (string | null | undefined)[]): T[] {
  const needle = normalize(term);
  if (!needle) return [...rows];
  return rows.filter((row) => fields(row).some((value) => !!value && normalize(value).includes(needle)));
}
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

/** Colores de estados que no están en REPAIR_STATUSES (los conocidos usan STATUS_COLORS). */
const EXTRA_STATUS_COLORS: Record<string, string> = {
  recibido: 'var(--color-brand-cyan)',
  terminado: 'var(--color-purple-500)',
  cancelado: 'var(--color-slate-400)',
};
/** Para cualquier otro estado que agregue el backend. */
const FALLBACK_STATUS_COLORS = ['var(--color-orange-500)', 'var(--color-red-500)', 'var(--color-emerald-700)', 'var(--color-yellow-500)'];

/**
 * Porcentajes enteros que suman exactamente 100 (método del mayor residuo):
 * se redondea hacia abajo y los puntos que faltan van a los de mayor parte decimal.
 */
function largestRemainder(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const result = exact.map((v) => Math.floor(v));
  let missing = 100 - result.reduce((a, b) => a + b, 0);
  exact
    .map((v, i) => ({ i, rest: v - result[i] }))
    .sort((a, b) => b.rest - a.rest)
    .forEach(({ i }) => {
      if (missing > 0 && counts[i] > 0) {
        result[i]++;
        missing--;
      }
    });
  return result;
}

function monthLabel(month: string): string {
  return formatDate(fromMonthKey(month), 'MMM yy', 'es');
}

@Component({
  selector: 'app-reports',
  imports: [DatePipe, NgTemplateOutlet, CopCurrencyPipe, LineChart, BarChart, HBarChart, DonutChart, Pagination, SearchBox, SelectDropdown],
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
  /** Atajo de fechas activo (se resalta en el control segmentado de teléfono); null si las fechas se eligieron a mano. */
  protected readonly activePreset = signal<Preset | null>('3months');
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
    this.activePreset.set(null);
    this.dateFrom.set(value);
    this.loadReports();
  }

  protected setDateTo(value: string): void {
    this.activePreset.set(null);
    this.dateTo.set(value);
    this.loadReports();
  }

  protected applyPreset(preset: Preset): void {
    this.activePreset.set(preset);
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

  // Cada tabla: lista completa -> filtrada por su buscador -> paginada.
  // La página vuelve a 1 al cambiar fechas/pestaña (pageResetKey) o el texto buscado.

  /** Fecha en los formatos que el usuario puede escribir: 04/10/26, 04/10/2026 y 2026-10-04. */
  private dateSearchKeys(value: string | null): string[] {
    const date = this.day(value);
    if (!date) return [];
    return [formatDate(date, 'dd/MM/yy', 'es'), formatDate(date, 'dd/MM/yyyy', 'es'), toDateKey(date)];
  }

  protected readonly incomeSearch = debouncedSearch(this.pageResetKey);
  protected readonly incomeRows = computed(() => this.ingresos()?.detalle ?? []);
  protected readonly filteredIncomeRows = computed(() =>
    filterRows(this.incomeRows(), this.incomeSearch.term(), (r) => [
      this.repairCode(r.id_arreglo),
      r.nombre_completo,
      ...this.dateSearchKeys(r.fecha_ingreso),
    ]),
  );
  protected readonly incomePage = linkedSignal({
    source: () => `${this.pageResetKey()}|${this.incomeSearch.term()}`,
    computation: () => 1,
  });
  protected readonly pagedIncomeRows = computed(() => paginate(this.filteredIncomeRows(), this.incomePage(), REPORT_PAGE_SIZE));

  /** Totales de "Detalle de arreglos — ingresos" sobre los registros filtrados. */
  protected readonly incomeTotals = computed(() =>
    this.filteredIncomeRows().reduce(
      (t, r) => ({
        cost: t.cost + this.num(r.valor),
        paid: t.paid + this.num(r.pagado),
        pending: t.pending + this.num(r.pendiente),
      }),
      { cost: 0, paid: 0, pending: 0 },
    ),
  );

  protected readonly repairsSearch = debouncedSearch(this.pageResetKey);
  protected readonly repairRows = computed(() => this.arreglos()?.listado ?? []);
  protected readonly filteredRepairRows = computed(() =>
    filterRows(this.repairRows(), this.repairsSearch.term(), (r) => [
      this.repairCode(r.id_arreglo),
      r.nombre_completo,
      r.descripcion,
      r.nombre_estado,
      this.statusLabels[this.statusKey(r.nombre_estado)],
    ]),
  );
  protected readonly repairsPage = linkedSignal({
    source: () => `${this.pageResetKey()}|${this.repairsSearch.term()}`,
    computation: () => 1,
  });
  protected readonly pagedRepairRows = computed(() => paginate(this.filteredRepairRows(), this.repairsPage(), REPORT_PAGE_SIZE));

  protected readonly clientsSearch = debouncedSearch(this.pageResetKey);
  protected readonly clientRows = computed(() => this.clientes()?.resumenPorCliente ?? []);
  protected readonly filteredClientRows = computed(() =>
    filterRows(this.clientRows(), this.clientsSearch.term(), (r) => [r.nombre_completo]),
  );
  protected readonly clientsPage = linkedSignal({
    source: () => `${this.pageResetKey()}|${this.clientsSearch.term()}`,
    computation: () => 1,
  });
  protected readonly pagedClientRows = computed(() => paginate(this.filteredClientRows(), this.clientsPage(), REPORT_PAGE_SIZE));

  /** Totales de "Resumen por cliente" sobre los clientes filtrados (no solo la página visible). */
  protected readonly clientTotals = computed(() =>
    this.filteredClientRows().reduce(
      (t, r) => ({
        repairs: t.repairs + this.num(r.total_arreglos),
        billed: t.billed + this.num(r.total_facturado),
        paid: t.paid + this.num(r.total_cobrado),
        balance: t.balance + this.num(r.saldo),
      }),
      { repairs: 0, billed: 0, paid: 0, balance: 0 },
    ),
  );

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

  // ---------- Distribución por estado ----------
  /** Dona: todos los estados que devuelve el backend (también Recibido, Terminado, Cancelado...). */
  protected readonly statusBreakdown = computed(() => this.breakdown(this.resumen()?.porEstado ?? []));

  /** Recuadros de la pestaña Arreglos: los 4 estados conocidos, aunque tengan 0. */
  protected readonly statusCounts = computed(() => {
    const counts = new Map(this.statusBreakdown().map((s) => [s.key, s.count]));
    return REPAIR_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
  });

  private breakdown(rows: ApiConteoEstado[]): DonutSegment[] {
    // Agrupa por clave normalizada ("En Proceso" -> en_proceso) conservando el nombre original.
    const groups = new Map<string, { name: string; count: number }>();
    for (const row of rows) {
      const key = toKey(row.nombre_estado);
      const group = groups.get(key) ?? { name: row.nombre_estado.trim(), count: 0 };
      group.count += Number(row.total);
      groups.set(key, group);
    }
    // Primero los estados conocidos (en su orden habitual), luego los demás como vienen.
    const known = REPAIR_STATUSES.filter((s) => groups.has(s));
    const keys = [...known, ...[...groups.keys()].filter((k) => !known.includes(k as RepairStatus))];
    const percents = largestRemainder(keys.map((k) => groups.get(k)!.count));
    let extra = 0;

    return keys.map((key, i) => {
      const isKnown = REPAIR_STATUSES.includes(key as RepairStatus);
      const color = isKnown
        ? STATUS_COLORS[key as RepairStatus]
        : (EXTRA_STATUS_COLORS[key] ?? FALLBACK_STATUS_COLORS[extra++ % FALLBACK_STATUS_COLORS.length]);
      return {
        key,
        label: isKnown ? STATUS_LABELS[key as RepairStatus] : groups.get(key)!.name,
        color,
        count: groups.get(key)!.count,
        percent: percents[i],
      };
    });
  }

  // ---------- Gráficas ----------
  protected readonly monthlyIncome = computed<ChartPoint[]>(() =>
    (this.resumen()?.ingresosPorMes ?? []).map((m) => ({
      label: monthLabel(m.mes),
      fullLabel: formatDate(fromMonthKey(m.mes), 'MMMM y', 'es'),
      value: Number(m.cobrado),
    })),
  );

  /** El último mes está incompleto si el rango termina antes de su último día. */
  protected readonly incomePartialLast = computed(() => {
    const last = this.resumen()?.ingresosPorMes.at(-1);
    if (!last) return false;
    const month = fromMonthKey(last.mes);
    const monthEnd = toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    return this.dateTo() < monthEnd;
  });

  /** Total del período y variación del último mes completo frente al anterior. */
  protected readonly incomeSummary = computed(() => {
    const points = this.monthlyIncome();
    const total = points.reduce((sum, p) => sum + p.value, 0);
    const lastIndex = points.length - 1 - (this.incomePartialLast() ? 1 : 0);
    const current = points[lastIndex];
    const previous = points[lastIndex - 1];
    const change = current && previous && previous.value > 0 ? Math.round(((current.value - previous.value) / previous.value) * 100) : null;
    return {
      total,
      change,
      changeAbs: Math.abs(change ?? 0),
      compare: current && previous ? `${current.fullLabel} frente a ${previous.fullLabel}` : '',
    };
  });

  protected readonly incomeChart = computed(() => {
    const rows = this.ingresos()?.porMes ?? [];
    const series: BarSeries[] = [
      { name: 'Cobrado', color: 'var(--color-brand-navy-dark)', values: rows.map((r) => Number(r.cobrado)) },
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
