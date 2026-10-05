import { Component, computed, input, model } from '@angular/core';

/** Registros por página en las listas paginadas. */
export const PAGE_SIZE = 20;

/** Cantidad máxima de números de página visibles a la vez. */
const MAX_VISIBLE_PAGES = 10;

/** En celular solo se muestran 5 números (la actual y 2 a cada lado). */
const COMPACT_VISIBLE_PAGES = 5;

export function totalPagesFor(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Página válida dentro del rango (por si la lista se acorta, p. ej. al eliminar un registro). */
export function clampPage(page: number, total: number, pageSize = PAGE_SIZE): number {
  return Math.min(Math.max(1, page), totalPagesFor(total, pageSize));
}

/** Porción de la lista que corresponde a la página indicada. */
export function paginate<T>(items: readonly T[], page: number, pageSize = PAGE_SIZE): T[] {
  const start = (clampPage(page, items.length, pageSize) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

@Component({
  selector: 'app-pagination',
  templateUrl: './pagination.html',
  styleUrl: './pagination.css',
})
export class Pagination {
  readonly total = input.required<number>();
  readonly pageSize = input(PAGE_SIZE);
  readonly page = model(1);

  protected readonly totalPages = computed(() => totalPagesFor(this.total(), this.pageSize()));
  protected readonly current = computed(() => clampPage(this.page(), this.total(), this.pageSize()));
  protected readonly isFirst = computed(() => this.current() === 1);
  protected readonly isLast = computed(() => this.current() === this.totalPages());

  /** Ventana de hasta 10 números que se desplaza para mantener centrada la página actual. */
  protected readonly pages = computed(() => {
    const totalPages = this.totalPages();
    const count = Math.min(MAX_VISIBLE_PAGES, totalPages);
    const start = Math.min(Math.max(1, this.current() - Math.floor(count / 2)), totalPages - count + 1);
    return Array.from({ length: count }, (_, i) => start + i);
  });

  /** Números que se ocultan en la vista compacta (celular), manteniendo siempre 5 visibles. */
  protected isFar(page: number): boolean {
    const pages = this.pages();
    const count = Math.min(COMPACT_VISIBLE_PAGES, pages.length);
    const first = pages[0];
    const last = pages[pages.length - 1];
    const start = Math.min(Math.max(first, this.current() - Math.floor(count / 2)), last - count + 1);
    return page < start || page >= start + count;
  }

  protected readonly from = computed(() => (this.total() === 0 ? 0 : (this.current() - 1) * this.pageSize() + 1));
  protected readonly to = computed(() => Math.min(this.current() * this.pageSize(), this.total()));

  protected goTo(page: number): void {
    const target = clampPage(page, this.total(), this.pageSize());
    if (target !== this.current()) this.page.set(target);
  }
}
