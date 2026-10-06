import { Component, computed, input, signal } from '@angular/core';
import { nextChartId } from '../chart.utils';

export interface DonutSegment {
  key: string;
  label: string;
  /** Color (hex o variable CSS). */
  color: string;
  count: number;
  /** Porcentaje entero; entre todos suman 100. */
  percent: number;
}

/** Geometría fija en px (la dona no se escala con el ancho). */
const SIZE = 200;
const CENTER = SIZE / 2;
const OUTER = 92;
const INNER = 66;
/** Separación entre segmentos (px medidos en el borde exterior). */
const GAP = 2;
/** Trazo del mismo color que redondea ligeramente las esquinas (se compensa en el hueco). */
const CORNER_STROKE = 2.5;

function polar(radius: number, angle: number): [number, number] {
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)];
}

/** Sector de anillo entre dos ángulos (radianes, 0 = arriba, sentido horario). */
function ringSector(start: number, end: number): string {
  const a0 = start - Math.PI / 2;
  const a1 = end - Math.PI / 2;
  const large = end - start > Math.PI ? 1 : 0;
  const f = (n: number) => +n.toFixed(3);
  const [ox0, oy0] = polar(OUTER, a0);
  const [ox1, oy1] = polar(OUTER, a1);
  const [ix1, iy1] = polar(INNER, a1);
  const [ix0, iy0] = polar(INNER, a0);
  return (
    `M${f(ox0)},${f(oy0)} A${OUTER},${OUTER} 0 ${large} 1 ${f(ox1)},${f(oy1)} ` +
    `L${f(ix1)},${f(iy1)} A${INNER},${INNER} 0 ${large} 0 ${f(ix0)},${f(iy0)} Z`
  );
}

/**
 * Dona con total en el centro, leyenda en lista y resaltado al pasar el mouse
 * (sobre el segmento o sobre la leyenda). Los segmentos se calculan con la fracción exacta
 * de cada cantidad, así cierran el círculo sin huecos ni superposiciones.
 */
@Component({
  selector: 'app-donut-chart',
  templateUrl: './donut-chart.html',
  styleUrl: './donut-chart.css',
})
export class DonutChart {
  readonly segments = input.required<DonutSegment[]>();
  /** Palabra bajo el total: "arreglos". */
  readonly unit = input('arreglos');
  readonly emptyText = input('Sin datos para el período.');

  protected readonly size = SIZE;
  protected readonly center = CENTER;
  protected readonly cornerStroke = CORNER_STROKE;
  /** Radio medio y grosor del anillo (para la máscara de la animación). */
  protected readonly ringRadius = (OUTER + INNER) / 2;
  protected readonly ringWidth = OUTER - INNER + 14; // margen para el segmento agrandado
  protected readonly maskId = nextChartId();

  protected readonly activeKey = signal<string | null>(null);

  /** Solo los estados con arreglos (la leyenda no muestra los de 0). */
  protected readonly visible = computed(() => this.segments().filter((s) => s.count > 0));
  protected readonly total = computed(() => this.visible().reduce((sum, s) => sum + s.count, 0));

  protected readonly arcs = computed(() => {
    const segments = this.visible();
    const total = this.total();
    if (!total) return [];
    // Un solo estado: anillo completo, sin separación.
    if (segments.length === 1) {
      const s = segments[0];
      return [{ ...s, path: `${ringSector(0, Math.PI)} ${ringSector(Math.PI, 2 * Math.PI)}`, single: true }];
    }
    // Medio hueco a cada lado: el visible queda en ~GAP px pese al trazo de las esquinas.
    const pad = (GAP + CORNER_STROKE) / 2 / OUTER;
    let angle = 0;
    return segments.map((s) => {
      const sweep = (s.count / total) * 2 * Math.PI;
      const start = angle + Math.min(pad, sweep / 4);
      const end = angle + sweep - Math.min(pad, sweep / 4);
      angle += sweep;
      return { ...s, path: ringSector(start, end), single: false };
    });
  });

  protected readonly active = computed(() => this.visible().find((s) => s.key === this.activeKey()) ?? null);
}
