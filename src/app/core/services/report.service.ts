import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiReporteArreglos,
  ApiReporteClientes,
  ApiReporteIngresos,
  ApiReporteResumen,
  ReportType,
} from '../models/api.model';

export interface DateRange {
  desde?: string;
  hasta?: string;
}

/** Consume /api/reportes (datos y exportación a Excel / PDF). */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/reportes`;

  getResumen(range: DateRange): Promise<ApiReporteResumen> {
    return firstValueFrom(this.http.get<ApiReporteResumen>(`${this.url}/resumen`, { params: this.params(range) }));
  }

  getIngresos(range: DateRange): Promise<ApiReporteIngresos> {
    return firstValueFrom(this.http.get<ApiReporteIngresos>(`${this.url}/ingresos`, { params: this.params(range) }));
  }

  getArreglos(range: DateRange): Promise<ApiReporteArreglos> {
    return firstValueFrom(this.http.get<ApiReporteArreglos>(`${this.url}/arreglos`, { params: this.params(range) }));
  }

  getClientes(range: DateRange): Promise<ApiReporteClientes> {
    return firstValueFrom(this.http.get<ApiReporteClientes>(`${this.url}/clientes`, { params: this.params(range) }));
  }

  /** Descarga el reporte generado por el backend (el token va en el header, por eso no se usa un <a href>). */
  async download(format: 'excel' | 'pdf', tipo: ReportType, range: DateRange): Promise<void> {
    const params = this.params(range).set('tipo', tipo);
    const blob = await firstValueFrom(this.http.get(`${this.url}/${format}`, { params, responseType: 'blob' }));
    const extension = format === 'excel' ? 'xlsx' : 'pdf';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reporte-${tipo}-${range.desde ?? 'inicio'}_a_${range.hasta ?? 'hoy'}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  private params(range: DateRange): HttpParams {
    let params = new HttpParams();
    if (range.desde) params = params.set('desde', range.desde);
    if (range.hasta) params = params.set('hasta', range.hasta);
    return params;
  }
}
