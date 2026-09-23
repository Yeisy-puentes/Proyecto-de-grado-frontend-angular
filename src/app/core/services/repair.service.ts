import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiArreglo, ApiArregloInput } from '../models/api.model';
import { Repair, RepairFormData, RepairStatus, mapRepair } from '../models/repair.model';
import { CatalogService } from './catalog.service';

export interface EmailNotification {
  enviado: boolean;
  motivo?: string;
}

/** Consume /api/arreglos. */
@Injectable({ providedIn: 'root' })
export class RepairService {
  private readonly http = inject(HttpClient);
  private readonly catalog = inject(CatalogService);
  private readonly url = `${environment.apiUrl}/arreglos`;

  private readonly repairsState = signal<Repair[]>([]);
  readonly repairs = this.repairsState.asReadonly();
  readonly loading = signal(false);

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await firstValueFrom(this.http.get<ApiArreglo[]>(this.url));
      this.repairsState.set(rows.map(mapRepair));
    } finally {
      this.loading.set(false);
    }
  }

  /** Vuelve a pedir un arreglo (p. ej. después de registrar un pago cambia su saldo). */
  async refresh(id: number): Promise<Repair> {
    const repair = mapRepair(await firstValueFrom(this.http.get<ApiArreglo>(`${this.url}/${id}`)));
    this.upsert(repair);
    return repair;
  }

  async create(data: RepairFormData): Promise<Repair> {
    const body = await this.toApi(data);
    const repair = mapRepair(await firstValueFrom(this.http.post<ApiArreglo>(this.url, body)));
    this.upsert(repair);
    return repair;
  }

  /** Actualiza el arreglo. Si pasa a "Listo" el backend envía un correo y lo informa en la respuesta. */
  async update(id: number, data: RepairFormData): Promise<{ repair: Repair; email: EmailNotification | null }> {
    const body = await this.toApi(data);
    const res = await firstValueFrom(this.http.put<ApiArreglo>(`${this.url}/${id}`, body));
    const repair = mapRepair(res);
    this.upsert(repair);
    return { repair, email: res.notificacion_correo ?? null };
  }

  /**
   * Cambia solo el estado (PUT /arreglos/:id { id_estado }).
   * Si el nuevo estado es "listo", el backend notifica al cliente por correo.
   */
  async changeStatus(id: number, status: RepairStatus): Promise<{ repair: Repair; email: EmailNotification | null }> {
    const id_estado = await this.catalog.statusId(status);
    const res = await firstValueFrom(this.http.put<ApiArreglo>(`${this.url}/${id}`, { id_estado }));
    const repair = mapRepair(res);
    this.upsert(repair);
    return { repair, email: res.notificacion_correo ?? null };
  }

  async markDelivered(id: number): Promise<Repair> {
    return (await this.changeStatus(id, 'entregado')).repair;
  }

  async delete(id: number): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.url}/${id}`));
    this.repairsState.update((list) => list.filter((r) => r.id !== id));
  }

  /** Reenvía el correo de "arreglo listo" al cliente. */
  async notifyReady(id: number): Promise<EmailNotification> {
    return firstValueFrom(this.http.post<EmailNotification>(`${this.url}/${id}/notificar`, {}));
  }

  private async toApi(data: RepairFormData): Promise<ApiArregloInput> {
    return {
      descripcion: data.description.trim() || null,
      fecha_ingreso: data.receivedDate,
      hora_ingreso: data.receivedTime || null,
      fecha_entrega: data.deliveryDate || null,
      hora_entrega: data.deliveryTime || null,
      valor: Number(data.cost) || 0,
      id_cliente: data.clientId,
      id_estado: await this.catalog.statusId(data.status),
    };
  }

  private upsert(repair: Repair): void {
    this.repairsState.update((list) =>
      list.some((r) => r.id === repair.id) ? list.map((r) => (r.id === repair.id ? repair : r)) : [repair, ...list],
    );
  }
}
