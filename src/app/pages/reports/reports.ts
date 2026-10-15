import { DatePipe, NgTemplateOutlet, formatDate } from '@angular/common';
import { Component, DestroyRef, OnInit, Signal, computed, inject, linkedSignal, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  ApiConteoEstado,
  ApiReporteArreglos,
  ApiReporteClientes,
  ApiReporteIngresos,
  ApiReporteResumen,
  ReportGrouping,
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
import { fromDateKey, toDateKey, todayKey } from '../../core/utils/date.utils';
import { apiErrorMessage } from '../../core/utils/http-error';
import { syncUrlParam, urlPage, urlParam } from '../../core/utils/url-state';
import { normalize } from '../../core/utils/text.utils';
import { BarChart, BarSeries } from '../../shared/components/charts/bar-chart/bar-chart';
import { DonutChart, DonutSegment } from '../../shared/components/charts/donut-chart/donut-chart';
import { HBarChart } from '../../shared/components/charts/hbar-chart/hbar-chart';
import { ChartPoint, LineChart } from '../../shared/components/charts/line-chart/line-chart';
import { Pagination, fillerRows, paginate } from '../../shared/components/pagination/pagination';
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
 * (rango de fechas o pestaña). El término se guarda en la URL (?`urlName`=) y se restaura al
 * cargar. Debe crearse en un contexto de inyección.
 */
function debouncedSearch(resetKey: Signal<string>, urlName: string) {
  const initial = inject(ActivatedRoute).snapshot.queryParamMap.get(urlName)?.trim() ?? '';
  const text = linkedSignal<string, string>({ source: resetKey, computation: (_, previous) => (previous ? '' : initial) });
  const query = linkedSignal<string, string>({ source: resetKey, computation: (_, previous) => (previous ? '' : initial) });
  syncUrlParam(urlName, () => query().trim(), '');
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

// ---------- Períodos (día / semana / mes) ----------
const GROUPING_NAMES: Record<ReportGrouping, string> = { dia: 'día', semana: 'semana', mes: 'mes' };

/** Atajo de fechas -> agrupación que mejor se lee en las gráficas. */
const PRESET_GROUPING: Record<Preset, ReportGrouping> = { month: 'dia', '3months': 'semana', year: 'mes' };

/** 'yyyy-MM' o 'yyyy-MM-dd' -> Date local del primer día del período. */
function periodStart(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

/** Clave del período al que pertenece una fecha (igual que la arma el backend). */
function periodKey(date: Date, grouping: ReportGrouping): string {
  if (grouping === 'mes') return toDateKey(date).slice(0, 7);
  if (grouping === 'semana') {
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
    return toDateKey(monday);
  }
  return toDateKey(date);
}

/** Último día del período, 'yyyy-MM-dd'. */
function periodEnd(key: string, grouping: ReportGrouping): string {
  const start = periodStart(key);
  if (grouping === 'mes') return toDateKey(new Date(start.getFullYear(), start.getMonth() + 1, 0));
  if (grouping === 'semana') return toDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
  return key;
}

/** Todas las claves de período entre dos fechas, para que los días/semanas sin datos salgan en 0. */
function periodKeys(from: string, to: string, grouping: ReportGrouping): string[] {
  if (!from || !to || from > to) return [];
  const keys: string[] = [];
  let cursor = periodStart(periodKey(fromDateKey(from), grouping));
  const last = periodKey(fromDateKey(to), grouping);
  // Tope de seguridad por si el rango es enorme (más de ~3 años por día).
  while (keys.length < 1200) {
    const key = periodKey(cursor, grouping);
    keys.push(key);
    if (key >= last) break;
    cursor =
      grouping === 'mes'
        ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
        : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + (grouping === 'semana' ? 7 : 1));
  }
  return keys;
}

function periodLabel(key: string, grouping: ReportGrouping): string {
  return formatDate(periodStart(key), grouping === 'mes' ? 'MMM yy' : 'd MMM', 'es');
}

function periodFullLabel(key: string, grouping: ReportGrouping): string {
  const start = periodStart(key);
  if (grouping === 'mes') return formatDate(start, 'MMMM y', 'es');
  if (grouping === 'semana') return `semana del ${formatDate(start, "d 'de' MMMM", 'es')}`;
  return formatDate(start, "EEEE d 'de' MMMM", 'es');
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

  // Pestaña, período, buscadores y páginas se guardan en la URL para conservarlos al recargar o volver.
  protected readonly activeTab = urlParam<ReportTab>('pestana', 'summary', ['summary', 'income', 'repairs', 'clients']);
  protected readonly tabs: { value: ReportTab; label: string }[] = [
    { value: 'summary', label: 'Resumen General' },
    { value: 'income', label: 'Ingresos' },
    { value: 'repairs', label: 'Arreglos' },
    { value: 'clients', label: 'Clientes' },
  ];

  // ---------- Período ----------
  protected readonly dateFrom = urlParam('desde', toDateKey(presetStart('3months')));
  protected readonly dateTo = urlParam('hasta', todayKey());
  /** Cómo se agrupan las gráficas y tablas: por día, semana o mes. */
  protected readonly grouping = urlParam<ReportGrouping>('agrupar', PRESET_GROUPING['3months'], ['dia', 'semana', 'mes']);
  protected readonly groupings: { value: ReportGrouping; label: string }[] = [
    { value: 'dia', label: 'Día' },
    { value: 'semana', label: 'Semana' },
    { value: 'mes', label: 'Mes' },
  ];
  protected readonly groupingName = computed(() => GROUPING_NAMES[this.grouping()]);
  /** Atajo de fechas activo (se resalta en el control segmentado de teléfono); null si las fechas se eligieron a mano. */
  protected readonly activePreset = signal<Preset | null>(this.presetOf(this.dateFrom(), this.dateTo(), this.grouping()));
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

  /** Atajo que corresponde a ese período (p. ej. al restaurarlo de la URL); null si se eligió a mano. */
  private presetOf(from: string, to: string, grouping: ReportGrouping): Preset | null {
    const presets: Preset[] = ['month', '3months', 'year'];
    return presets.find((p) => from === toDateKey(presetStart(p)) && to === todayKey() && grouping === PRESET_GROUPING[p]) ?? null;
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
    this.grouping.set(PRESET_GROUPING[preset]);
    this.loadReports();
  }

  protected setGrouping(grouping: ReportGrouping): void {
    if (grouping === this.grouping()) return;
    this.grouping.set(grouping);
    this.loadReports();
  }

  /** GET /reportes/resumen, /ingresos, /arreglos y /clientes para el período seleccionado. */
  private async loadReports(): Promise<void> {
    const range = { desde: this.dateFrom(), hasta: this.dateTo(), agrupar: this.grouping() };
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
        agrupar: this.grouping(),
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

  protected readonly incomeSearch = debouncedSearch(this.pageResetKey, 'buscar_ingresos');
  /** Pagos recibidos en el período (por fecha de pago). */
  protected readonly incomeRows = computed(() => this.ingresos()?.detalle ?? []);
  protected readonly filteredIncomeRows = computed(() =>
    filterRows(this.incomeRows(), this.incomeSearch.term(), (r) => [
      this.repairCode(r.id_arreglo),
      r.nombre_completo,
      r.tipo_pago,
      ...this.dateSearchKeys(r.fecha_pago),
    ]),
  );
  protected readonly incomePage = urlPage('pagina_ingresos', () => `${this.pageResetKey()}|${this.incomeSearch.term()}`);
  protected readonly pagedIncomeRows = computed(() => paginate(this.filteredIncomeRows(), this.incomePage(), REPORT_PAGE_SIZE));
  protected readonly incomeFillers = computed(() => fillerRows(this.pagedIncomeRows().length, REPORT_PAGE_SIZE));

  /** Total de "Pagos recibidos" sobre los registros filtrados. */
  protected readonly incomeTotal = computed(() => this.filteredIncomeRows().reduce((t, r) => t + this.num(r.monto), 0));

  protected readonly repairsSearch = debouncedSearch(this.pageResetKey, 'buscar_arreglos');
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
  protected readonly repairsPage = urlPage('pagina_arreglos', () => `${this.pageResetKey()}|${this.repairsSearch.term()}`);
  protected readonly pagedRepairRows = computed(() => paginate(this.filteredRepairRows(), this.repairsPage(), REPORT_PAGE_SIZE));
  protected readonly repairFillers = computed(() => fillerRows(this.pagedRepairRows().length, REPORT_PAGE_SIZE));

  protected readonly clientsSearch = debouncedSearch(this.pageResetKey, 'buscar_clientes');
  protected readonly clientRows = computed(() => this.clientes()?.resumenPorCliente ?? []);
  protected readonly filteredClientRows = computed(() =>
    filterRows(this.clientRows(), this.clientsSearch.term(), (r) => [r.nombre_completo]),
  );
  protected readonly clientsPage = urlPage('pagina_clientes', () => `${this.pageResetKey()}|${this.clientsSearch.term()}`);
  protected readonly pagedClientRows = computed(() => paginate(this.filteredClientRows(), this.clientsPage(), REPORT_PAGE_SIZE));
  protected readonly clientFillers = computed(() => fillerRows(this.pagedClientRows().length, REPORT_PAGE_SIZE));

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
  /** Claves de todos los períodos del rango (los que no tienen datos quedan en 0). */
  private readonly periodKeys = computed(() => periodKeys(this.dateFrom(), this.dateTo(), this.grouping()));

  /** Valores por período, rellenando con 0 los períodos sin datos. */
  private fillPeriods<T extends { periodo: string }>(rows: readonly T[], value: (row: T) => number): number[] {
    const byKey = new Map(rows.map((r) => [r.periodo, value(r)]));
    return this.periodKeys().map((key) => byKey.get(key) ?? 0);
  }

  protected readonly periodIncome = computed<ChartPoint[]>(() => {
    const grouping = this.grouping();
    const values = this.fillPeriods(this.resumen()?.ingresosPorPeriodo ?? [], (r) => Number(r.cobrado));
    return this.periodKeys().map((key, i) => ({
      label: periodLabel(key, grouping),
      fullLabel: periodFullLabel(key, grouping),
      value: values[i],
    }));
  });

  /** El último período está incompleto si el rango termina antes de su último día. */
  protected readonly incomePartialLast = computed(() => {
    const last = this.periodKeys().at(-1);
    return !!last && this.dateTo() < periodEnd(last, this.grouping());
  });

  /** Total del período y variación del último período completo frente al anterior. */
  protected readonly incomeSummary = computed(() => {
    const points = this.periodIncome();
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
    const grouping = this.grouping();
    const series: BarSeries[] = [
      {
        name: 'Cobrado',
        color: 'var(--color-brand-navy-dark)',
        values: this.fillPeriods(this.ingresos()?.porPeriodo ?? [], (r) => Number(r.cobrado)),
      },
    ];
    return { labels: this.periodKeys().map((k) => periodLabel(k, grouping)), series };
  });

  protected readonly repairsChart = computed(() => {
    const grouping = this.grouping();
    const series: BarSeries[] = [
      {
        name: 'Arreglos',
        color: 'var(--color-brand-navy-dark)',
        values: this.fillPeriods(this.arreglos()?.porPeriodo ?? [], (r) => Number(r.total)),
      },
    ];
    return { labels: this.periodKeys().map((k) => periodLabel(k, grouping)), series };
  });

  protected readonly topClients = computed(() =>
    (this.clientes()?.topClientes ?? []).map((c) => ({ label: c.nombre_completo, value: Number(c.total_arreglos) })),
  );
}
