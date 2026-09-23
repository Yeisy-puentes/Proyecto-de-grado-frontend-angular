import { Pipe, PipeTransform } from '@angular/core';

/** Formatea pesos colombianos sin decimales: 45000 -> "$45.000". */
@Pipe({ name: 'cop' })
export class CopCurrencyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return '';
    const sign = value < 0 ? '-' : '';
    const digits = Math.round(Math.abs(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}$${digits}`;
  }
}
