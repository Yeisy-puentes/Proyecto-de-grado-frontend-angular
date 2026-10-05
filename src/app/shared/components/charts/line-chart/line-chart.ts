import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { nextChartId, niceMax, shortMoney } from '../chart.utils';

export interface ChartPoint {
  label: string;
  value: number;
  /** Texto del tooltip (p. ej. "agosto 2026"); si falta se usa `label`. */
  fullLabel?: string;
}

/** Márgenes internos en px: a la izquierda el eje Y, abajo los meses. */
const PAD = { top: 16, right: 16, bottom: 30, left: 52 };
/** Separación extra para que el primer y el último punto no queden pegados al borde. */
const INSET = 10;
const MONTH_CHAR_WIDTH = 6.8; // meses, 12px

interface Coord {
  x: number;
  y: number;
  label: string;
  fullLabel: string;
  value: number;
}

/**
 * Tramos de curva monótona (igual a `type="monotone"` de Recharts / d3.curveMonotoneX):
 * suaviza la línea sin "pasarse" por encima o debajo de los valores reales.
 * Devuelve un comando `C` por cada tramo entre dos puntos consecutivos.
 */
function monotoneSegments(pts: Coord[]): string[] {
  const n = pts.length;
  if (n < 2) return [];
  const h = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const s = pts.slice(1).map((p, i) => (p.y - pts[i].y) / (h[i] || 1));
  const t = new Array<number>(n).fill(0);

  for (let i = 1; i < n - 1; i++) {
    const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
    t[i] = (Math.sign(s[i - 1]) + Math.sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(p)) || 0;
  }
  t[0] = n > 2 ? (3 * s[0] - t[1]) / 2 : s[0];
  t[n - 1] = n > 2 ? (3 * s[n - 2] - t[n - 2]) / 2 : s[0];

  const f = (v: number) => v.toFixed(1);
  return pts.slice(0, -1).map((a, i) => {
    const b = pts[i + 1];
    const dx = h[i] / 3;
    return `C${f(a.x + dx)},${f(a.y + dx * t[i])} ${f(b.x - dx)},${f(b.y - dx * t[i + 1])} ${f(b.x)},${f(b.y)}`;
  });
}

/**
 * Gráfica de área: curva suavizada, guías punteadas, punto en cada mes y tooltip.
 * El viewBox usa el tamaño real del contenedor (ResizeObserver), así los textos no se deforman.
 * Con `partialLast` el último tramo se dibuja punteado (mes en curso).
 */
@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.html',
  styleUrl: './line-chart.css',
  host: {
    '(mousemove)': 'onPointerMove($event)',
    '(mouseleave)': 'activeIndex.set(null)',
  },
})
export class LineChart {
  readonly points = input.required<ChartPoint[]>();
  readonly color = input('var(--color-brand-blue)');
  /** Nombre de la serie en el tooltip ("Ingresos"). */
  readonly seriesName = input('Ingresos');
  /** 'money' para valores en pesos; 'count' para cantidades (eje Y con enteros). */
  readonly valueType = input<'money' | 'count'>('money');
  readonly emptyText = input('Sin datos para el período.');
  /** El último punto es un mes incompleto: tramo punteado y aviso en el tooltip. */
  readonly partialLast = input(false);

  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');

  /** Tamaño del área de dibujo en px (valores por defecto para el render del servidor). */
  protected readonly width = signal(600);
  protected readonly height = signal(280);

  protected readonly pad = PAD;
  protected readonly gradientId = nextChartId();
  protected readonly activeIndex = signal<number | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // ResizeObserver solo existe en el navegador: se crea después del primer render.
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.width.set(Math.round(width));
          this.height.set(Math.round(height));
        }
      });
      observer.observe(this.plot().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected readonly hasData = computed(() => this.points().some((p) => p.value > 0));
  protected readonly viewBox = computed(() => `0 0 ${this.width()} ${this.height()}`);
  protected readonly baseline = computed(() => this.height() - PAD.bottom);
  protected readonly plotRight = computed(() => this.width() - PAD.right);

  /** Máximo del eje Y: 4 saltos "redondos" (p. ej. 0, 1M, 2M, 3M, 4M). */
  private readonly max = computed(() => {
    const top = Math.max(0, ...this.points().map((p) => p.value)) / 4;
    // En cantidades cada salto debe ser un entero (0, 1, 2, 3, 4...).
    return niceMax(this.valueType() === 'count' ? Math.ceil(top) : top) * 4;
  });

  protected readonly ticks = computed(() =>
    [0, 1, 2, 3, 4].map((i) => ({
      y: this.baseline() - ((this.baseline() - PAD.top) * i) / 4,
      label: this.axisLabel((this.max() * i) / 4),
    })),
  );

  protected readonly coords = computed<Coord[]>(() => {
    const pts = this.points();
    const left = PAD.left + INSET;
    const right = this.plotRight() - INSET;
    const step = pts.length > 1 ? (right - left) / (pts.length - 1) : 0;
    const base = this.baseline();
    return pts.map((p, i) => ({
      x: pts.length > 1 ? left + i * step : (left + right) / 2,
      y: base - (p.value / this.max()) * (base - PAD.top),
      label: p.label,
      fullLabel: p.fullLabel ?? p.label,
      value: p.value,
    }));
  });

  /** Meses visibles en el eje X (uno de cada N si no caben todos). */
  protected readonly labelStep = computed(() => {
    const coords = this.coords();
    if (coords.length < 2) return 1;
    const longest = Math.max(...coords.map((c) => c.label.length));
    return Math.max(1, Math.ceil((longest * MONTH_CHAR_WIDTH + 10) / (coords[1].x - coords[0].x)));
  });

  /** Índice desde el que la línea es punteada (último tramo si el mes está incompleto). */
  private readonly dashFrom = computed(() => {
    const n = this.coords().length;
    return this.partialLast() && n >= 2 ? n - 2 : n;
  });

  private readonly segments = computed(() => monotoneSegments(this.coords()));

  protected readonly solidPath = computed(() => {
    const coords = this.coords();
    if (!coords.length) return '';
    const start = `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
    return [start, ...this.segments().slice(0, this.dashFrom())].join(' ');
  });

  protected readonly dashedPath = computed(() => {
    const from = this.dashFrom();
    const c = this.coords()[from];
    const segs = this.segments().slice(from);
    return c && segs.length ? `M${c.x.toFixed(1)},${c.y.toFixed(1)} ${segs.join(' ')}` : '';
  });

  protected readonly areaPath = computed(() => {
    const coords = this.coords();
    if (coords.length < 2) return '';
    const first = coords[0];
    const last = coords[coords.length - 1];
    const base = this.baseline();
    return `M${first.x.toFixed(1)},${first.y.toFixed(1)} ${this.segments().join(' ')} L${last.x.toFixed(1)},${base} L${first.x.toFixed(1)},${base} Z`;
  });

  /** Punto resaltado + tooltip (posición en px dentro del área de dibujo). */
  protected readonly active = computed(() => {
    const index = this.activeIndex();
    const coords = this.coords();
    const c = index === null ? undefined : coords[index];
    if (index === null || !c) return null;
    return {
      ...c,
      flip: c.x > this.width() * 0.6,
      partial: this.partialLast() && index === coords.length - 1,
      text: this.formatValue(c.value),
    };
  });

  protected onPointerMove(event: MouseEvent): void {
    const coords = this.coords();
    if (!coords.length || !this.hasData()) return;
    const rect = this.plot().nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let nearest = 0;
    coords.forEach((c, i) => {
      if (Math.abs(c.x - x) < Math.abs(coords[nearest].x - x)) nearest = i;
    });
    this.activeIndex.set(nearest);
  }

  protected formatValue(value: number): string {
    if (this.valueType() === 'count') return String(Math.round(value));
    return `$${Math.round(value).toLocaleString('es-CO')}`;
  }

  private axisLabel(value: number): string {
    return this.valueType() === 'count' ? String(+value.toFixed(1)) : shortMoney(value);
  }
}
