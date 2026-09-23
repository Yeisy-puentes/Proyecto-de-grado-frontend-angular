/**
 * Devuelve la fecha local en formato yyyy-MM-dd (sin conversión a UTC).
 * Acepta Date, 'yyyy-MM-dd' o fechas ISO completas como las que envía el backend.
 */
export function toDateKey(date: Date | string): string {
  // 'yyyy-MM-dd' ya es una clave; new Date() la interpretaría como UTC y podría cambiar el día.
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Convierte 'yyyy-MM-dd' en un Date local (medianoche), útil para el DatePipe. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/** 'yyyy-MM' -> Date del primer día de ese mes. */
export function fromMonthKey(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** Hora actual en formato HH:mm (para valores por defecto de inputs type="time"). */
export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
