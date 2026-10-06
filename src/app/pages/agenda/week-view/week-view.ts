import { Component, input, output } from '@angular/core';
import { Reminder } from '../../../core/models/reminder.model';
import { Repair, STATUS_LABELS, statusClass } from '../../../core/models/repair.model';
import { Time12Pipe } from '../../../shared/pipes/time12.pipe';

/** Elemento de la agenda: entrega de un arreglo o recordatorio (ordenados por hora). */
export type AgendaEvent = { kind: 'repair'; time: string; repair: Repair } | { kind: 'reminder'; time: string; reminder: Reminder };

export interface WeekDay {
  /** Fecha yyyy-MM-dd. */
  key: string;
  weekday: string;
  day: number;
  isToday: boolean;
  events: AgendaEvent[];
}

/** Vista de semana de la agenda: 7 columnas (domingo a sábado) con tarjetas compactas. */
@Component({
  selector: 'app-week-view',
  imports: [Time12Pipe],
  templateUrl: './week-view.html',
  styleUrl: './week-view.css',
})
export class WeekView {
  readonly days = input.required<WeekDay[]>();
  /** Clic en el encabezado de un día (o en un recordatorio): ir a la vista de día. */
  readonly dayClick = output<string>();
  /** Clic en una tarjeta de arreglo: abrir su detalle en la vista de día. */
  readonly repairClick = output<{ key: string; repairId: number }>();

  protected readonly statusClass = statusClass;
  protected readonly statusLabels = STATUS_LABELS;
}
