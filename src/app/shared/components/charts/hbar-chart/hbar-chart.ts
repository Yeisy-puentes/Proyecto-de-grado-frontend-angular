import { Component, computed, input } from '@angular/core';

export interface HBarItem {
  label: string;
  value: number;
}

const LABEL_WIDTH = 130;
const MAX_BAR = 330;
const ROW = 50;

/** Gráfica de barras horizontales (SVG), p. ej. clientes más activos. */
@Component({
  selector: 'app-hbar-chart',
  templateUrl: './hbar-chart.html',
  styleUrl: '../line-chart/line-chart.css',
})
export class HBarChart {
  readonly items = input.required<HBarItem[]>();
  readonly color = input('#06b6d4');

  protected readonly viewBox = computed(() => `0 0 500 ${Math.max(this.items().length, 1) * ROW + 10}`);

  protected readonly rows = computed(() => {
    const max = Math.max(1, ...this.items().map((i) => i.value));
    return this.items().map((item, i) => ({
      ...item,
      y: 10 + i * ROW,
      width: Math.max(4, (item.value / max) * MAX_BAR),
      barX: LABEL_WIDTH,
    }));
  });
}
