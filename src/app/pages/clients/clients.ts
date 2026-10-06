import { Component, ElementRef, OnInit, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Client, ClientFormData } from '../../core/models/client.model';
import { ClientService } from '../../core/services/client.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/utils/http-error';
import { normalize } from '../../core/utils/text.utils';
import { ClientFormModal } from '../../shared/components/client-form-modal/client-form-modal';
import { autoPageSize } from '../../shared/components/pagination/auto-page-size';
import { pageMinHeight } from '../../shared/components/pagination/page-min-height';
import { Pagination, paginate } from '../../shared/components/pagination/pagination';

@Component({
  selector: 'app-clients',
  imports: [RouterLink, ClientFormModal, Pagination],
  templateUrl: './clients.html',
  styleUrl: './clients.css',
})
export class Clients implements OnInit {
  private readonly clientService = inject(ClientService);
  private readonly toast = inject(ToastService);

  protected readonly loading = this.clientService.loading;
  protected readonly search = signal('');
  protected readonly newClientModalOpen = signal(false);
  protected readonly editingClient = signal<Client | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      await this.clientService.load();
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudieron cargar los clientes'));
    }
  }

  /** Búsqueda sin distinguir tildes ni mayúsculas: "maria" encuentra a "María". */
  protected readonly filteredClients = computed(() => {
    const term = normalize(this.search().trim());
    return this.clientService
      .clients()
      .filter((c) => !term || [c.name, c.email, c.cedula, c.phone].some((value) => normalize(value).includes(term)));
  });

  /** Vuelve a la página 1 cada vez que cambia la búsqueda. */
  protected readonly page = linkedSignal({ source: this.search, computation: () => 1 });

  private readonly cardsGrid = viewChild<ElementRef<HTMLElement>>('cardsGrid');

  /** Filas de tarjetas que caben en pantalla × columnas del grid (10 fijas en celular). */
  protected readonly pageSize = autoPageSize({
    items: this.filteredClients,
    page: this.page,
    list: this.cardsGrid,
    itemSelector: ':scope > .card',
  });

  protected readonly pagedClients = computed(() => paginate(this.filteredClients(), this.page(), this.pageSize()));

  /** Alto de una página completa de tarjetas: el grid no se encoge al buscar (0 en celular). */
  protected readonly gridMinHeight = pageMinHeight({
    list: this.cardsGrid,
    itemSelector: ':scope > .card',
    pageSize: this.pageSize,
    items: this.pagedClients,
  });

  protected async createClient(data: ClientFormData): Promise<void> {
    try {
      const client = await this.clientService.create(data);
      this.newClientModalOpen.set(false);
      this.toast.success(`Cliente ${client.name} creado.`);
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo crear el cliente'));
    }
  }

  protected async updateClient(data: ClientFormData): Promise<void> {
    const client = this.editingClient();
    if (!client) return;
    try {
      await this.clientService.update(client.id, data);
      this.editingClient.set(null);
      this.toast.success('Cliente actualizado.');
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo actualizar el cliente'));
    }
  }
}
