import { DestroyRef, ElementRef, Signal, afterNextRender, afterRenderEffect, inject, signal } from '@angular/core';
import { MOBILE_QUERY } from './auto-page-size';

const RESIZE_DEBOUNCE_MS = 150;

export interface PageMinHeightOptions {
  /** Contenedor directo de los registros (grid de tarjetas o lista). */
  list: Signal<ElementRef<HTMLElement> | undefined>;
  /** Selector de cada registro dentro de `list` (los que no coincidan no se miden). */
  itemSelector: string;
  /** Registros por página. */
  pageSize: () => number;
  /** Registros de la página visible (para volver a medir cuando cambian). */
  items: () => readonly unknown[];
}

/**
 * Alto mínimo (en px) de una página completa de la lista: filas que ocupa `pageSize` × alto del
 * registro más alto medido, más los espacios entre filas. En grids divide entre las columnas.
 * Se aplica como `min-height` del contenedor para que no se encoja al filtrar o buscar.
 *
 * El alto medido solo crece hasta el próximo resize, así no oscila entre páginas.
 * En celular devuelve 0 (la lista conserva su alto natural y el desplazamiento normal).
 * Debe llamarse en un contexto de inyección (inicializador de campo del componente).
 */
export function pageMinHeight(options: PageMinHeightOptions): Signal<number> {
  const destroyRef = inject(DestroyRef);
  const minHeight = signal(0);
  let itemHeight = 0;

  const measure = (): void => {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      minHeight.set(0);
      return;
    }
    const list = options.list()?.nativeElement;
    if (!list) return;
    for (const item of list.querySelectorAll<HTMLElement>(options.itemSelector)) {
      itemHeight = Math.max(itemHeight, Math.ceil(item.getBoundingClientRect().height));
    }
    if (!itemHeight) return; // Cargando o sin resultados aún: no hay nada que medir.

    const style = getComputedStyle(list);
    const gap = parseFloat(style.rowGap) || 0;
    const columns = style.display.includes('grid') ? style.gridTemplateColumns.split(' ').filter(Boolean).length : 1;
    const rows = Math.ceil(options.pageSize() / columns);
    minHeight.set(rows * itemHeight + Math.max(0, rows - 1) * gap);
  };

  afterRenderEffect(() => {
    options.items();
    options.pageSize();
    measure();
  });

  afterNextRender(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        itemHeight = 0; // Con otro ancho cambian los altos.
        measure();
      }, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', onResize);
    destroyRef.onDestroy(() => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    });
  });

  return minHeight.asReadonly();
}
