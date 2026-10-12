import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { nextChartId, niceMax, shortMoney } from '../chart.utils';

export interface BarSeries {
  name: string;
  /** Color de la serie (hex o variable CSS, p. ej. 'var(--color-brand-navy-dark)'). */
  color: string;
  values: number[];
}

/** Márgenes internos en px: arriba deja sitio a los valores, a la izquierda al eje Y, abajo a los meses. */
const PAD = { top: 26, right: 8, bottom: 30, left: 52 };
/** Espacio entre barras de un mismo grupo. */
const BAR_GAP = 4;
const MAX_BAR_WIDTH = 36;
/** Fracción del ancho de cada grupo que ocupan las barras (el resto separa los grupos). */
const GROUP_FILL = 0.6;
const BAR_RADIUS = 5;
/** Ancho aproximado de un carácter (px) para decidir si un texto cabe. */
const VALUE_CHAR_WIDTH = 6.2; // valores, 11px
const MONTH_CHAR_WIDTH = 6.8; // meses, 12px

/** Barra con esquinas superiores redondeadas y base recta. */
function barPath(x: number, y: number, width: number, height: number, base: number): string {
  if (height <= 0) return '';
  const r = Math.min(BAR_RADIUS, width / 2, height);
  const f = (n: number) => +n.toFixed(2);
  return `M${f(x)},${f(base)} V${f(y + r)} Q${f(x)},${f(y)} ${f(x + r)},${f(y)} H${f(x + width - r)} Q${f(x + width)},${f(y)} ${f(x + width)},${f(y + r)} V${f(base)} Z`;
}

/**
 * Gráfica de barras verticales agrupadas (SVG a mano).
 * El viewBox usa el tamaño real del contenedor (medido con ResizeObserver), así los textos
 * nunca se deforman. Incluye eje Y, guías punteadas, valores sobre las barras, tooltip,
 * resaltado de la barra activa y animación de entrada.
 */
@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.html',
  styleUrl: './bar-chart.css',
})
export class BarChart {
  readonly labels = input.required<string[]>();
  readonly series = input.required<BarSeries[]>();
  /** Formato del valor completo en el tooltip. */
  readonly format = input<(value: number) => string>((v) => String(v));
  /** 'money' para pesos (eje y valores en formato corto $2,1M); 'count' para cantidades enteras. */
  readonly valueType = input<'money' | 'count'>('count');

  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');

  /** Tamaño del área de dibujo en px (valores por defecto para el render del servidor). */
  protected readonly width = signal(600);
  protected readonly height = signal(240);

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

  protected readonly hasData = computed(() => this.series().some((s) => s.values.some((v) => v > 0)));
  protected readonly showLegend = computed(() => this.series().length > 1);

  protected readonly viewBox = computed(() => `0 0 ${this.width()} ${this.height()}`);
  protected readonly baseline = computed(() => this.height() - PAD.bottom);
  protected readonly plotRight = computed(() => this.width() - PAD.right);

  /** Máximo del eje Y: 4 saltos "redondos" (p. ej. $0, $1M, $2M, $3M, $4M). */
  private readonly max = computed(() => {
    const top = Math.max(0, ...this.series().flatMap((s) => s.values)) / 4;
    // En cantidades cada salto debe ser un entero (0, 1, 2, 3, 4...).
    return niceMax(this.valueType() === 'count' ? Math.ceil(top) : top) * 4;
  });

  protected readonly ticks = computed(() =>
    [0, 1, 2, 3, 4].map((i) => ({
      y: this.baseline() - ((this.baseline() - PAD.top) * i) / 4,
      label: this.short((this.max() * i) / 4),
    })),
  );

  protected readonly groups = computed(() => {
    const labels = this.labels();
    const series = this.series();
    const base = this.baseline();
    const max = this.max();
    const plotHeight = base - PAD.top;
    const groupWidth = (this.width() - PAD.left - PAD.right) / Math.max(labels.length, 1);
    const count = Math.max(series.length, 1);
    const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, (groupWidth * GROUP_FILL - BAR_GAP * (count - 1)) / count));
    const barsWidth = barWidth * count + BAR_GAP * (count - 1);
    // Con una serie el valor puede usar todo el grupo; con varias, solo el ancho de su barra.
    const valueRoom = count === 1 ? groupWidth - 6 : barWidth + BAR_GAP - 2;
    // Si los meses no caben todos, se muestra uno de cada N.
    const longestLabel = Math.max(0, ...labels.map((l) => l.length));
    const labelStep = Math.max(1, Math.ceil((longestLabel * MONTH_CHAR_WIDTH + 8) / groupWidth));

    return labels.map((label, i) => {
      const x = PAD.left + i * groupWidth;
      const start = x + (groupWidth - barsWidth) / 2;
      const bars = series.map((s, j) => {
        const value = s.values[i] ?? 0;
        const height = (value / max) * plotHeight;
        const barX = start + j * (barWidth + BAR_GAP);
        const text = this.short(value);
        return {
          value,
          y: base - height,
          center: barX + barWidth / 2,
          path: barPath(barX, base - height, barWidth, height, base),
          fill: `url(#${this.gradientId}-${j})`,
          text,
          showValue: value > 0 && text.length * VALUE_CHAR_WIDTH <= valueRoom,
        };
      });
      return {
        label,
        x,
        width: groupWidth,
        center: x + groupWidth / 2,
        top: Math.min(base, ...bars.map((b) => b.y)),
        showLabel: i % labelStep === 0,
        bars,
      };
    });
  });

  /** Tooltip del grupo activo: al lado del grupo (a la izquierda si está cerca del borde derecho). */
  protected readonly tooltip = computed(() => {
    const index = this.activeIndex();
    const group = index === null ? undefined : this.groups()[index];
    if (index === null || !group) return null;
    const flip = group.center > this.width() * 0.6;
    const top = Math.min(Math.max(group.top, PAD.top + 32), this.baseline() - 32);
    return {
      label: group.label,
      flip,
      left: flip ? group.x + group.width * 0.15 : group.x + group.width * 0.85,
      top,
      rows: this.series().map((s) => ({ name: s.name, color: s.color, value: this.format()(s.values[index] ?? 0) })),
    };
  });

  private short(value: number): string {
    return this.valueType() === 'money' ? shortMoney(value) : String(Math.round(value));
  }
}
