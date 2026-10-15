import { DestroyRef, Injectable, WritableSignal, effect, inject, linkedSignal, signal } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';

/** Marca de las navegaciones hechas aquí (solo cambian query params), para distinguirlas de las del usuario. */
const URL_STATE_MARK = 'urlState';

/**
 * Escribe en la URL los cambios de varias señales a la vez: los junta en una sola navegación
 * (replaceUrl, para no llenar el historial) por cada ruta.
 */
@Injectable({ providedIn: 'root' })
class UrlStateWriter {
  private readonly router = inject(Router);
  /** Todos los valores que pidió cada ruta mientras siga viva (si se cancela una navegación, la siguiente los repite). */
  private readonly desired = new Map<ActivatedRoute, Params>();
  private scheduled = false;

  write(route: ActivatedRoute, name: string, value: string | null): void {
    this.desired.set(route, { ...this.desired.get(route), [name]: value });
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }

  forget(route: ActivatedRoute): void {
    this.desired.delete(route);
  }

  private flush(): void {
    this.scheduled = false;
    // Si el usuario ya va hacia otra página, no se le interrumpe.
    const navigation = this.router.currentNavigation();
    if (navigation && !navigation.extras.state?.[URL_STATE_MARK]) return;
    for (const [route, queryParams] of this.desired) {
      const current = route.snapshot.queryParamMap;
      if (Object.entries(queryParams).every(([name, value]) => current.get(name) === value)) continue;
      this.router.navigate([], {
        relativeTo: route,
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true,
        state: { [URL_STATE_MARK]: true },
      });
    }
  }
}

/**
 * Mantiene `state` igual al query param `name`: el valor por defecto no se escribe (URL limpia).
 * Debe llamarse en un contexto de inyección (inicializador de campo del componente).
 */
export function syncUrlParam<T>(name: string, state: () => T, fallback: T): void {
  const route = inject(ActivatedRoute);
  const writer = inject(UrlStateWriter);
  inject(DestroyRef).onDestroy(() => writer.forget(route));
  effect(() => {
    const value = state();
    writer.write(route, name, value === fallback ? null : String(value));
  });
}

/**
 * Señal de texto guardada en la URL (?name=valor), p. ej. el buscador o un filtro.
 * Con `allowed`, un valor desconocido en la URL se cambia por `fallback`.
 */
export function urlParam<T extends string = string>(name: string, fallback: NoInfer<T>, allowed?: readonly NoInfer<T>[]): WritableSignal<T> {
  const raw = inject(ActivatedRoute).snapshot.queryParamMap.get(name);
  const initial = raw !== null && (!allowed || allowed.includes(raw as T)) ? (raw as T) : fallback;
  const state = signal<T>(initial);
  syncUrlParam(name, state, fallback);
  return state;
}

/** Número de página leído de la URL: entero ≥ 1, o 1 si falta o no es válido. */
export function initialPage(name = 'pagina'): number {
  const page = Number(inject(ActivatedRoute).snapshot.queryParamMap.get(name));
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/**
 * Página actual guardada en la URL (?pagina=2), para que al volver de otra pantalla siga en la misma.
 * Con `resetOn` (búsqueda o filtros) vuelve a 1 cada vez que eso cambia, pero no al cargar.
 * Si la página es mayor que el total, la paginación muestra la última (clampPage).
 */
export function urlPage(name = 'pagina', resetOn?: () => unknown): WritableSignal<number> {
  const initial = initialPage(name);
  const page = resetOn
    ? linkedSignal<unknown, number>({ source: resetOn, computation: (_, previous) => (previous ? 1 : initial) })
    : signal(initial);
  syncUrlParam(name, page, 1);
  return page;
}
