import { Pipe, PipeTransform } from '@angular/core';

/** "14:30" -> "2:30 p. m." ; vacío -> '' */
@Pipe({ name: 'time12' })
export class Time12Pipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const [h, m] = value.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return value;
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'p. m.' : 'a. m.'}`;
  }
}
