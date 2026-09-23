import { ApiRecordatorio } from './api.model';
import { toDateKey } from '../utils/date.utils';

export type ReminderColor = 'blue' | 'green' | 'yellow' | 'red' | 'purple';

export interface Reminder {
  id: number;
  title: string;
  description?: string;
  /** Fecha ISO (yyyy-MM-dd). */
  date: string;
  /** Hora HH:mm. */
  time: string;
  color: ReminderColor;
}

export const REMINDER_COLORS: { value: ReminderColor; label: string }[] = [
  { value: 'blue', label: 'Azul' },
  { value: 'green', label: 'Verde' },
  { value: 'yellow', label: 'Amarillo' },
  { value: 'red', label: 'Rojo' },
  { value: 'purple', label: 'Morado' },
];

export function mapReminder(api: ApiRecordatorio): Reminder {
  return {
    id: api.id_recordatorio,
    title: api.titulo,
    description: api.descripcion ?? undefined,
    date: toDateKey(api.fecha),
    time: api.hora.slice(0, 5),
    color: api.color,
  };
}
