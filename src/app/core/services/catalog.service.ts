import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiEstado, ApiTipoPago } from '../models/api.model';
import { PaymentMethod, RepairStatus, toKey } from '../models/repair.model';

/** Catálogos del backend: estados de arreglo y tipos de pago (se cargan una vez). */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  private readonly statusIds = signal<Partial<Record<RepairStatus, number>>>({});
  private readonly methodIds = signal<Partial<Record<PaymentMethod, number>>>({});
  private loading: Promise<void> | null = null;

  /** Carga los catálogos si aún no se han cargado. */
  ensureLoaded(): Promise<void> {
    this.loading ??= this.fetch().catch((err) => {
      this.loading = null; // permite reintentar
      throw err;
    });
    return this.loading;
  }

  async statusId(status: RepairStatus): Promise<number> {
    await this.ensureLoaded();
    const id = this.statusIds()[status];
    if (!id) throw new Error(`El estado "${status}" no existe en el backend`);
    return id;
  }

  async methodId(method: PaymentMethod): Promise<number> {
    await this.ensureLoaded();
    const id = this.methodIds()[method];
    if (!id) throw new Error(`El tipo de pago "${method}" no existe en el backend`);
    return id;
  }

  private async fetch(): Promise<void> {
    const [estados, tipos] = await Promise.all([
      firstValueFrom(this.http.get<ApiEstado[]>(`${this.api}/estados`)),
      firstValueFrom(this.http.get<ApiTipoPago[]>(`${this.api}/tipos-pago`)),
    ]);
    this.statusIds.set(Object.fromEntries(estados.map((e) => [toKey(e.nombre_estado), e.id_estado])));
    this.methodIds.set(Object.fromEntries(tipos.map((t) => [toKey(t.tipo_pago), t.id_tipo_pago])));
  }
}
