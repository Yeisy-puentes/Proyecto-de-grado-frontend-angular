import { DestroyRef, ElementRef, Signal, WritableSignal, afterNextRender, afterRenderEffect, inject, signal, untracked } from '@angular/core';
import { PAGE_SIZE, clampPage } from './pagination';

/** Celular: vista en tarjetas con desplazamiento normal. */
const MOBILE_QUERY = '(max-width: 767px)';
const MOBILE_PAGE_SIZE = 10;
const MIN_PAGE_SIZE = 5;
const RESIZE_DEBOUNCE_MS = 150;

export interface AutoPageSizeOptions {
  /** Lista ya filtrada que se pagina. */
  items: () => readonly unknown[];
  /** Página actual (se ajusta para conservar el primer registro visible al cambiar el tamaño). */
  page: WritableSignal<number>;
  /** Contenedor directo de los registros (tbody de la tabla o grid de tarjetas). */
  list: Signal<ElementRef<HTMLElement> | undefined>;
  /** Selector de cada registro dentro de `list`. */
  itemSelector: string;
  /** Elementos dentro de `list` que no son registros pero ocupan alto (p. ej. el separador "Entregados"). */
  reservedSelector?: string;
  /** Si hay que reservar el alto de `reservedSelector` (aunque no esté en la página actual). */
  needsReserved?: () => boolean;
}

/**
 * Calcula cuántos registros caben en pantalla sin desplazamiento vertical: el alto disponible
 * desde el inicio de la lista hasta el fondo del área de contenido, menos lo que va debajo de la
 * lista (bordes y barra de paginación), dividido entre el alto real de un registro medido del DOM.
 * En grids multiplica las filas que caben por el número de columnas.
 *
 * Debe llamarse en un contexto de inyección (inicializador de campo del componente).
 * Solo toca `window` y el DOM en el navegador (hooks de render), así que es seguro con SSR.
 */
export function autoPageSize(options: AutoPageSizeOptions): Signal<number> {
  const host = inject(ElementRef<HTMLElement>).nativeElement;
  const destroyRef = inject(DestroyRef);
  const pageSize = signal(PAGE_SIZE);

  // Máximos medidos: solo crecen hasta el próximo resize, así el tamaño converge y no oscila
  // al pasar por páginas con registros más altos o al ocultarse la barra de paginación.
  let itemHeight = 0;
  let reservedHeight = 0;
  let belowHeight = 0;

  /** Cambia el tamaño manteniendo a la vista el registro que estaba primero. */
  const apply = (size: number): void => {
    const current = untracked(pageSize);
    if (size === current) return;
    const firstIndex = (clampPage(untracked(options.page), untracked(options.items).length, current) - 1) * current;
    pageSize.set(size);
    options.page.set(Math.floor(firstIndex / size) + 1);
  };

  const measure = (): void => {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      apply(MOBILE_PAGE_SIZE);
      return;
    }

    const list = options.list()?.nativeElement;
    const items = list?.querySelectorAll<HTMLElement>(options.itemSelector);
    if (!list || !items?.length) return; // Cargando o sin resultados: no hay nada que medir.

    for (const item of items) itemHeight = Math.max(itemHeight, Math.ceil(item.getBoundingClientRect().height));

    let reserved = 0;
    if (options.reservedSelector && options.needsReserved?.()) {
      const els = list.querySelectorAll<HTMLElement>(options.reservedSelector);
      if (els.length) {
        let sum = 0;
        for (const el of els) sum += Math.ceil(el.getBoundingClientRect().height);
        reservedHeight = Math.max(reservedHeight, sum);
      }
      // Si aún no se ha visto en pantalla, se reserva el alto de un registro (por exceso).
      reserved = reservedHeight || itemHeight;
    }

    const listRect = list.getBoundingClientRect();
    belowHeight = Math.max(belowHeight, host.getBoundingClientRect().bottom - listRect.bottom);

    const scroller = scrollParent(host);
    const listTop = listRect.top + (scroller?.scrollTop ?? 0);
    const bottomLimit = scroller
      ? scroller.getBoundingClientRect().top + scroller.clientTop + scroller.clientHeight - parseFloat(getComputedStyle(scroller).paddingBottom)
      : document.documentElement.clientHeight;

    const listStyle = getComputedStyle(list);
    const gap = parseFloat(listStyle.rowGap) || 0;
    const columns = listStyle.display.includes('grid') ? listStyle.gridTemplateColumns.split(' ').filter(Boolean).length : 1;

    const available = bottomLimit - listTop - belowHeight - reserved;
    const rows = Math.max(Math.ceil(MIN_PAGE_SIZE / columns), Math.floor((available + gap) / (itemHeight + gap)));
    apply(rows * columns);
  };

  // Mide tras cada render en el que cambie la lista, la página o el tamaño (converge en 1–2 pasadas).
  afterRenderEffect(() => {
    options.items();
    options.page();
    pageSize();
    measure();
  });

  afterNextRender(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        itemHeight = reservedHeight = belowHeight = 0; // Con otro ancho cambian los altos.
        measure();
      }, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', onResize);
    destroyRef.onDestroy(() => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    });
  });

  return pageSize.asReadonly();
}

/** Ancestro con desplazamiento vertical propio (en el layout, `.page-content`). */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}
