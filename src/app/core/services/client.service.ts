import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiCliente } from '../models/api.model';
import { Client, ClientFormData, mapClient, toApiClient } from '../models/client.model';

/** Consume /api/clientes. */
@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/clientes`;

  private readonly clientsState = signal<Client[]>([]);
  readonly clients = this.clientsState.asReadonly();
  readonly loading = signal(false);

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await firstValueFrom(this.http.get<ApiCliente[]>(this.url));
      this.clientsState.set(rows.map(mapClient));
    } finally {
      this.loading.set(false);
    }
  }

  getById(id: number): Client | undefined {
    return this.clientsState().find((c) => c.id === id);
  }

  async fetchById(id: number): Promise<Client> {
    return mapClient(await firstValueFrom(this.http.get<ApiCliente>(`${this.url}/${id}`)));
  }

  /** Autocompletar por cédula, teléfono o nombre (mínimo 2 caracteres). */
  async search(term: string): Promise<Client[]> {
    const params = new HttpParams().set('buscar', term);
    const rows = await firstValueFrom(this.http.get<ApiCliente[]>(this.url, { params }));
    return rows.map(mapClient);
  }

  async create(data: ClientFormData): Promise<Client> {
    const created = mapClient(await firstValueFrom(this.http.post<ApiCliente>(this.url, toApiClient(data))));
    this.clientsState.update((list) => [...list, created]);
    return created;
  }

  async update(id: number, data: ClientFormData): Promise<Client> {
    const updated = mapClient(
      await firstValueFrom(this.http.put<ApiCliente>(`${this.url}/${id}`, toApiClient(data))),
    );
    this.clientsState.update((list) => list.map((c) => (c.id === id ? updated : c)));
    return updated;
  }
}
