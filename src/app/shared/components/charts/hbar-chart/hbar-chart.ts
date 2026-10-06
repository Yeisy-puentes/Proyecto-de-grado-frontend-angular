import { Component, ElementRef, computed, inject, input, signal } from '@angular/core';

export interface HBarItem {
  label: string;
  value: number;
}

/** Puestos destacados con el tono más intenso. */
const TOP_RANKS = 3;
/** Máximo de filas visibles (8 × 36 px ≈ 300 px de alto). */
const MAX_ROWS = 8;

/**
 * Gráfica de barras horizontales tipo ranking (p. ej. clientes más activos).
 * Se arma con HTML/CSS (grid) en lugar de SVG: el nombre se corta con "…" según el ancho
 * real disponible, el texto nunca se deforma y en celular el nombre pasa arriba de la barra.
 */
@Component({
  selector: 'app-hbar-chart',
  templateUrl: './hbar-chart.html',
  styleUrl: './hbar-chart.css',
  host: { '[style.--hbar-color]': 'color()' },
})
export class HBarChart {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly items = input.required<HBarItem[]>();
  /** Color base (hex o variable CSS). */
  readonly color = input('var(--color-brand-cyan)');
  /** Unidad que acompaña al valor: "12 arreglos", "1 arreglo". */
  readonly unit = input('arreglos');
  readonly unitSingular = input('arreglo');

  protected readonly activeIndex = signal<number | null>(null);
  /** Posición del tooltip en px, relativa al componente. */
  private readonly tooltipPos = signal<{ left: number; top: number; flip: boolean } | null>(null);

  protected readonly rows = computed(() => {
    // Los 8 con más arreglos, de mayor a menor.
    const items = [...this.items()].sort((a, b) => b.value - a.value).slice(0, MAX_ROWS);
    const max = Math.max(1, ...items.map((i) => i.value));
    return items.map((item, i) => ({
      ...item,
      rank: i + 1,
      isTop: i < TOP_RANKS,
      percent: Math.max(2, (item.value / max) * 100),
    }));
  });

  protected readonly tooltip = computed(() => {
    const index = this.activeIndex();
    const pos = this.tooltipPos();
    const row = index === null ? undefined : this.rows()[index];
    return row && pos ? { ...pos, label: row.label, value: row.value } : null;
  });

  protected unitFor(value: number): string {
    return value === 1 ? this.unitSingular() : this.unit();
  }

  /** Activa la fila y ubica el tooltip al final de su barra (a la izquierda si está cerca del borde). */
  protected onRowEnter(index: number, event: MouseEvent): void {
    const row = event.currentTarget as HTMLElement;
    const track = row.querySelector<HTMLElement>('.hbar-track');
    if (!track) return;
    const hostRect = this.host.nativeElement.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    // Se usa el riel y el porcentaje (no el ancho de la barra) para no depender de la animación.
    const left = trackRect.left - hostRect.left + (trackRect.width * this.rows()[index].percent) / 100;
    this.activeIndex.set(index);
    this.tooltipPos.set({
      left,
      top: rowRect.top - hostRect.top + rowRect.height / 2,
      flip: left > hostRect.width * 0.6,
    });
  }

  protected onLeave(): void {
    this.activeIndex.set(null);
    this.tooltipPos.set(null);
  }
}
