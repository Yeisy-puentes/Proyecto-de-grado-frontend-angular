import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiPago, ApiPagoInput } from '../models/api.model';
import { Payment, PaymentMethod, mapPayment } from '../models/repair.model';
import { todayKey } from '../utils/date.utils';
import { CatalogService } from './catalog.service';
import { RepairService } from './repair.service';

/** Consume /api/pagos. El backend valida que no se pague más del saldo pendiente. */
@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly catalog = inject(CatalogService);
  private readonly repairService = inject(RepairService);
  private readonly url = `${environment.apiUrl}/pagos`;

  private readonly paymentsState = signal<Payment[]>([]);
  readonly payments = this.paymentsState.asReadonly();

  /** Último método de pago usado en cada arreglo (para la columna "Método"). */
  readonly lastMethodByRepair = computed(() => {
    const map = new Map<number, Payment>();
    for (const p of this.paymentsState()) {
      const current = map.get(p.repairId);
      if (!current || p.date > current.date || (p.date === current.date && p.id > current.id)) {
        map.set(p.repairId, p);
      }
    }
    return map;
  });

  async load(): Promise<void> {
    const rows = await firstValueFrom(this.http.get<ApiPago[]>(this.url));
    this.paymentsState.set(rows.map(mapPayment));
  }

  async getByRepair(repairId: number): Promise<Payment[]> {
    const params = new HttpParams().set('id_arreglo', repairId);
    const rows = await firstValueFrom(this.http.get<ApiPago[]>(this.url, { params }));
    return rows.map(mapPayment);
  }

  /** Vuelve a pedir los pagos de un arreglo (p. ej. el abono que se guardó al crearlo). */
  async syncRepair(repairId: number): Promise<void> {
    const fresh = await this.getByRepair(repairId);
    this.paymentsState.update((list) => [...list.filter((p) => p.repairId !== repairId), ...fresh]);
  }

  /** Registra un pago y actualiza el saldo del arreglo. */
  async create(repairId: number, amount: number, method: PaymentMethod): Promise<Payment> {
    const body: ApiPagoInput = {
      monto: amount,
      fecha_pago: todayKey(),
      id_tipo_pago: await this.catalog.methodId(method),
      id_arreglo: repairId,
    };
    const payment = mapPayment(await firstValueFrom(this.http.post<ApiPago>(this.url, body)));
    this.paymentsState.update((list) => [...list, payment]);
    await this.repairService.refresh(repairId);
    return payment;
  }

  /** Corrige un pago (monto, método o fecha). El backend vuelve a validar el saldo. */
  async update(payment: Payment, changes: { amount: number; method: PaymentMethod; date: string }): Promise<Payment> {
    const body: ApiPagoInput = {
      monto: changes.amount,
      fecha_pago: changes.date,
      id_tipo_pago: await this.catalog.methodId(changes.method),
      id_arreglo: payment.repairId,
    };
    const updated = mapPayment(await firstValueFrom(this.http.put<ApiPago>(`${this.url}/${payment.id}`, body)));
    this.paymentsState.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
    await this.repairService.refresh(payment.repairId);
    return updated;
  }

  /** Elimina un pago registrado por error y actualiza el saldo del arreglo. */
  async delete(payment: Payment): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.url}/${payment.id}`));
    this.paymentsState.update((list) => list.filter((p) => p.id !== payment.id));
    await this.repairService.refresh(payment.repairId);
  }
}
