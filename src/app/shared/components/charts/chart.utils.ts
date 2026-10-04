/** Redondea hacia arriba a un valor "bonito" (1, 2, 5 x 10^n) para el eje Y. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Formato corto para ejes monetarios: 150000 -> "$150k", 2500000 -> "$2.5M". */
export function compactMoney(value: number): string {
  if (value >= 1_000_000) return `$${+(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${+(value / 1_000).toFixed(0)}k`;
  return `$${value}`;
}

let chartId = 0;
/** Id único para gradientes SVG (evita choques si hay varias gráficas en la página). */
export function nextChartId(): string {
  return `chart-${++chartId}`;
}

/** Formato corto en pesos con coma decimal: 2100000 -> "$2,1M", 150000 -> "$150k", 0 -> "$0". */
export function shortMoney(value: number): string {
  const fmt = (n: number, decimals: number) => n.toLocaleString('es-CO', { maximumFractionDigits: decimals });
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${fmt(value / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `$${fmt(value / 1_000, 0)}k`;
  return `$${fmt(value, 0)}`;
}
