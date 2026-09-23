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
}
