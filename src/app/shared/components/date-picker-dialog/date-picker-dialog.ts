import { formatDate } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { fromDateKey, toDateKey, todayKey } from '../../../core/utils/date.utils';

type PickerView = 'days' | 'months' | 'years';

const MOBILE_QUERY = '(max-width: 767px)';
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic'];
/** Años por página en la vista de años (3 columnas × 4 filas). */
const YEARS_PER_PAGE = 12;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Suma meses sin desbordar (31 de enero + 1 mes -> 28/29 de febrero). */
function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}

/**
 * Calendario propio para elegir una fecha.
 * - Celular: ventana centrada con fondo oscuro y bloqueo del desplazamiento.
 * - Computador: menú flotante debajo del elemento que lo contiene (el contenedor debe ser `position: relative`).
 * Accesible: role="dialog", foco en el día seleccionado, flechas del teclado y foco de vuelta al cerrar.
 */
@Component({
  selector: 'app-date-picker-dialog',
  templateUrl: './date-picker-dialog.html',
  styleUrl: './date-picker-dialog.css',
})
export class DatePickerDialog {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  /** Fecha inicial seleccionada (yyyy-MM-dd) o null. */
  readonly value = input<string | null>(null);
  /** Fecha elegida en formato yyyy-MM-dd. */
  readonly dateSelected = output<string>();
  /** "Limpiar": quitar la fecha. */
  readonly cleared = output<void>();
  /** Cerrar sin elegir (Cancelar, fondo oscuro o Escape). */
  readonly closed = output<void>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly months = MONTHS;
  protected readonly today = todayKey();

  protected readonly view = signal<PickerView>('days');
  /** Día con el foco del teclado (yyyy-MM-dd): al abrir, el seleccionado o hoy. */
  protected readonly focusedKey = linkedSignal(() => this.value() ?? this.today);
  /** Primer día del mes visible: al abrir, el mes del día enfocado. */
  protected readonly viewMonth = linkedSignal(() => {
    const d = fromDateKey(this.value() ?? this.today);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  protected readonly title = computed(() => {
    const month = this.viewMonth();
    if (this.view() === 'months') return String(month.getFullYear());
    if (this.view() === 'years') {
      const start = this.yearsPageStart();
      return `${start} – ${start + YEARS_PER_PAGE - 1}`;
    }
    return capitalize(formatDate(month, 'MMMM y', 'es'));
  });

  /** 6 semanas (42 días) empezando en domingo, como la agenda. */
  protected readonly days = computed(() => {
    const month = this.viewMonth();
    const start = addDays(month, -month.getDay());
    const selected = this.value();
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      const key = toDateKey(date);
      return {
        key,
        day: date.getDate(),
        isOutside: date.getMonth() !== month.getMonth(),
        isToday: key === this.today,
        isSelected: key === selected,
        label: formatDate(date, "EEEE d 'de' MMMM 'de' y", 'es'),
      };
    });
  });

  private readonly yearsPageStart = computed(() => {
    const year = this.viewMonth().getFullYear();
    return year - (year % YEARS_PER_PAGE);
  });
  protected readonly years = computed(() => Array.from({ length: YEARS_PER_PAGE }, (_, i) => this.yearsPageStart() + i));

  private readonly previouslyFocused = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      this.focusDay(this.focusedKey());

      // Celular: bloquear el desplazamiento de la página (y del área de contenido, que es la que se desplaza).
      if (window.matchMedia(MOBILE_QUERY).matches) {
        const locked = [document.documentElement, ...scrollParents(this.host.nativeElement)];
        const previous = locked.map((el) => el.style.overflow);
        locked.forEach((el) => (el.style.overflow = 'hidden'));
        destroyRef.onDestroy(() => locked.forEach((el, i) => (el.style.overflow = previous[i])));
      }
    });

    // Devolver el foco al botón que abrió el calendario.
    destroyRef.onDestroy(() => {
      if (this.previouslyFocused?.isConnected) this.previouslyFocused.focus();
    });
  }

  // ---------- Acciones ----------
  protected select(key: string): void {
    this.dateSelected.emit(key);
  }

  protected selectToday(): void {
    this.dateSelected.emit(this.today);
  }

  protected clear(): void {
    this.cleared.emit();
  }

  protected cancel(): void {
    this.closed.emit();
  }

  /** Título: días -> meses -> años. */
  protected toggleView(): void {
    this.view.update((v) => (v === 'days' ? 'months' : v === 'months' ? 'years' : 'days'));
  }

  protected chooseMonth(month: number): void {
    const year = this.viewMonth().getFullYear();
    const day = fromDateKey(this.focusedKey()).getDate();
    this.view.set('days');
    // Mismo día en el mes elegido (sin pasar del último día de ese mes).
    this.moveFocusTo(new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate())));
  }

  protected chooseYear(year: number): void {
    this.viewMonth.update((m) => new Date(year, m.getMonth(), 1));
    this.view.set('months');
  }

  protected prev(): void {
    this.shift(-1);
  }

  protected next(): void {
    this.shift(1);
  }

  private shift(step: number): void {
    const view = this.view();
    const amount = view === 'days' ? step : view === 'months' ? step * 12 : step * YEARS_PER_PAGE;
    this.viewMonth.update((m) => new Date(m.getFullYear(), m.getMonth() + amount, 1));
    if (view === 'days') this.focusedKey.set(toDateKey(addMonths(fromDateKey(this.focusedKey()), step)));
  }

  // ---------- Teclado ----------
  protected onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Que no llegue a otros atajos de Escape de la página.
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    } else if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  protected onGridKeydown(event: KeyboardEvent): void {
    const current = fromDateKey(this.focusedKey());
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(current, -1),
      ArrowRight: () => addDays(current, 1),
      ArrowUp: () => addDays(current, -7),
      ArrowDown: () => addDays(current, 7),
      Home: () => addDays(current, -current.getDay()),
      End: () => addDays(current, 6 - current.getDay()),
      PageUp: () => addMonths(current, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(current, event.shiftKey ? 12 : 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    this.moveFocusTo(move());
  }

  private moveFocusTo(date: Date): void {
    const key = toDateKey(date);
    this.focusedKey.set(key);
    this.viewMonth.set(new Date(date.getFullYear(), date.getMonth(), 1));
    this.focusDay(key);
  }

  /** Enfoca el botón del día después de que Angular pinte la cuadrícula. */
  private focusDay(key: string): void {
    afterNextRender(() => this.panel().nativeElement.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus(), {
      injector: this.injector,
    });
  }

  /** Mantiene el foco dentro del diálogo con Tab / Shift+Tab. */
  private trapFocus(event: KeyboardEvent): void {
    const focusables = Array.from(
      this.panel().nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"])'),
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

/** Ancestros con desplazamiento vertical propio (en el layout, `.page-content`). */
function scrollParents(el: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) result.push(node);
  }
  return result;
}
