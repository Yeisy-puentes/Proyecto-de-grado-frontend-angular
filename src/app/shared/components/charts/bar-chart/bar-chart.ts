import { Component, computed, input } from '@angular/core';
import { niceMax } from '../chart.utils';

export interface BarSeries {
  name: string;
  color: string;
  values: number[];
}

const WIDTH = 500;
const TOP = 20;
const BASELINE = 200;

/** Gráfica de barras verticales agrupadas (SVG). */
@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.html',
  styleUrl: '../line-chart/line-chart.css',
})
export class BarChart {
  readonly labels = input.required<string[]>();
  readonly series = input.required<BarSeries[]>();
  /** Formato del valor en el tooltip. */
  readonly format = input<(value: number) => string>((v) => String(v));

  protected readonly baseline = BASELINE;

  protected readonly hasData = computed(() => this.series().some((s) => s.values.some((v) => v > 0)));

  protected readonly groups = computed(() => {
    const labels = this.labels();
    const series = this.series();
    const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
    const groupWidth = WIDTH / Math.max(labels.length, 1);
    const barWidth = Math.min(40, (groupWidth * 0.6) / Math.max(series.length, 1));
    const groupBarsWidth = barWidth * series.length + 4 * (series.length - 1);

    return labels.map((label, i) => {
      const start = i * groupWidth + (groupWidth - groupBarsWidth) / 2;
      return {
        label,
        center: i * groupWidth + groupWidth / 2,
        bars: series.map((s, j) => {
          const value = s.values[i] ?? 0;
          const height = (value / max) * (BASELINE - TOP);
          return {
            x: start + j * (barWidth + 4),
            y: BASELINE - height,
            width: barWidth,
            height,
            color: s.color,
            title: `${s.name}: ${this.format()(value)}`,
          };
        }),
      };
    });
  });
}
