import { Component, computed, input, signal } from '@angular/core';
import { compactMoney, nextChartId, niceMax } from '../chart.utils';

export interface ChartPoint {
  label: string;
  value: number;
}

/** Sistema de coordenadas interno del SVG (se estira al tamaño del contenedor). */
const WIDTH = 650;
const HEIGHT = 320;
const LEFT = 60;
const RIGHT = 620;
const TOP = 20;
const BOTTOM = 280;

interface Coord {
  x: number;
  y: number;
  label: string;
  value: number;
}

/**
 * Curva monótona (igual a `type="monotone"` de Recharts / d3.curveMonotoneX):
 * suaviza la línea sin "pasarse" por encima o debajo de los valores reales.
 */
function monotonePath(pts: Coord[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;

  const n = pts.length;
  const h = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const s = pts.slice(1).map((p, i) => (p.y - pts[i].y) / (h[i] || 1));
  const t = new Array<number>(n).fill(0);

  for (let i = 1; i < n - 1; i++) {
    const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
    t[i] = (Math.sign(s[i - 1]) + Math.sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(p)) || 0;
  }
  t[0] = n > 2 ? (3 * s[0] - t[1]) / 2 : s[0];
  t[n - 1] = n > 2 ? (3 * s[n - 2] - t[n - 2]) / 2 : s[0];

  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = h[i] / 3;
    const a = pts[i];
    const b = pts[i + 1];
    d += ` C${(a.x + dx).toFixed(1)},${(a.y + dx * t[i]).toFixed(1)} ${(b.x - dx).toFixed(1)},${(b.y - dx * t[i + 1]).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Gráfica de área (diseño Figma): curva suavizada, cuadrícula punteada horizontal,
 * sin ejes, y tooltip con línea guía al pasar el mouse.
 * Los textos, el punto activo y el tooltip son HTML para que no se deformen al estirar el SVG.
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
  readonly color = input('#2563eb');
  /** Nombre de la serie en el tooltip ("Ingresos : $400.000"). */
  readonly seriesName = input('Ingresos');

  protected readonly gradientId = nextChartId();
  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  protected readonly left = LEFT;
  protected readonly right = RIGHT;
  protected readonly top = TOP;
  protected readonly bottom = BOTTOM;

  protected readonly activeIndex = signal<number | null>(null);

  protected readonly hasData = computed(() => this.points().some((p) => p.value > 0));

  /** Máximo del eje Y: 4 saltos "redondos" (p. ej. 0, 10k, 20k, 30k, 40k). */
  private readonly max = computed(() => niceMax(Math.max(0, ...this.points().map((p) => p.value)) / 4) * 4);

  protected readonly ticks = computed(() =>
    [4, 3, 2, 1, 0].map((i) => {
      const y = BOTTOM - ((BOTTOM - TOP) * i) / 4;
      return { y, top: this.pctY(y), label: compactMoney((this.max() * i) / 4) };
    }),
  );

  protected readonly coords = computed<Coord[]>(() => {
    const pts = this.points();
    const step = pts.length > 1 ? (RIGHT - LEFT) / (pts.length - 1) : 0;
    return pts.map((p, i) => ({
      x: pts.length > 1 ? LEFT + i * step : (LEFT + RIGHT) / 2,
      y: BOTTOM - (p.value / this.max()) * (BOTTOM - TOP),
      label: p.label,
      value: p.value,
    }));
  });

  protected readonly linePath = computed(() => monotonePath(this.coords()));

  protected readonly areaPath = computed(() => {
    const coords = this.coords();
    if (!coords.length) return '';
    return `${this.linePath()} L${coords[coords.length - 1].x},${BOTTOM} L${coords[0].x},${BOTTOM} Z`;
  });

  /** Punto resaltado + posición del tooltip (en % del contenedor). */
  protected readonly active = computed(() => {
    const index = this.activeIndex();
    const c = index === null ? undefined : this.coords()[index];
    if (!c) return null;
    const left = this.pctX(c.x);
    return { ...c, left, top: this.pctY(c.y), flip: left > 70 };
  });

  protected onPointerMove(event: MouseEvent): void {
    const coords = this.coords();
    if (!coords.length || !this.hasData()) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    coords.forEach((c, i) => {
      if (Math.abs(c.x - x) < Math.abs(coords[nearest].x - x)) nearest = i;
    });
    this.activeIndex.set(nearest);
  }

  protected pctX(x: number): number {
    return (x / WIDTH) * 100;
  }

  protected pctY(y: number): number {
    return (y / HEIGHT) * 100;
  }

  protected money(value: number): string {
    return `$${Math.round(value).toLocaleString('es-CO')}`;
  }
}
