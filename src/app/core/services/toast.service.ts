import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  /** Milisegundos antes de cerrarse sola; 0 = se queda hasta que se cierre con la ✕. */
  duration: number;
  /** Cambia cada vez que se repite el mismo mensaje, para reiniciar la barra de tiempo. */
  version: number;
}

/** Cuánto dura cada tipo en pantalla antes de cerrarse sola. */
const DURATION: Record<ToastType, number> = { success: 5000, info: 6000, error: 5000 };
/** Máximo de alertas a la vez; si llegan más, se quita la más antigua. */
const MAX_TOASTS = 4;

interface Timer {
  handle?: ReturnType<typeof setTimeout>;
  remaining: number;
  startedAt: number;
}

/** Mensajes flotantes (éxito / error / aviso) para las acciones contra el backend. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly timers = new Map<number, Timer>();
  readonly toasts = signal<Toast[]>([]);

  success(message: string): void {
    this.show('success', message);
  }

  error(message: string): void {
    this.show('error', message);
  }

  info(message: string): void {
    this.show('info', message);
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id)?.handle);
    this.timers.delete(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Mouse encima: se detiene la cuenta regresiva (la barra se pausa con CSS). */
  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer?.handle) return;
    clearTimeout(timer.handle);
    timer.handle = undefined;
    timer.remaining -= Date.now() - timer.startedAt;
  }

  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle) return;
    this.startTimer(id, timer.remaining);
  }

  private show(type: ToastType, message: string): void {
    const duration = DURATION[type];

    // El mismo mensaje repetido no se apila: se reinicia el que ya está.
    const existing = this.toasts().find((t) => t.type === type && t.message === message);
    if (existing) {
      this.toasts.update((list) => list.map((t) => (t.id === existing.id ? { ...t, version: t.version + 1 } : t)));
      clearTimeout(this.timers.get(existing.id)?.handle);
      if (duration) this.startTimer(existing.id, duration);
      return;
    }

    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, type, message, duration, version: 0 }]);
    if (duration) this.startTimer(id, duration);

    const overflow = this.toasts().length - MAX_TOASTS;
    for (const old of this.toasts().slice(0, Math.max(0, overflow))) this.dismiss(old.id);
  }

  private startTimer(id: number, ms: number): void {
    this.timers.set(id, { remaining: ms, startedAt: Date.now(), handle: setTimeout(() => this.dismiss(id), ms) });
  }
}
