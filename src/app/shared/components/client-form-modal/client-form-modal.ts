import { Component, OnInit, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FieldError } from '../../forms/field-error/field-error';
import { FormValidation } from '../../forms/form-validation.directive';
import { Client, ClientFormData } from '../../../core/models/client.model';

/**
 * Modal reutilizable para crear o editar un cliente.
 * Se usa en Clientes (nuevo / editar) y en Arreglos (nuevo cliente rápido).
 */
@Component({
  selector: 'app-client-form-modal',
  imports: [FormsModule, FieldError, FormValidation],
  templateUrl: './client-form-modal.html',
  styleUrl: './client-form-modal.css',
})
export class ClientFormModal implements OnInit {
  readonly mode = input<'create' | 'edit'>('create');
  /** Cliente a editar (solo en modo 'edit'). */
  readonly client = input<Client | null>(null);
  /** Prefijo para los id de los campos, evita duplicados si hay varios modales. */
  readonly idPrefix = input('client');

  readonly save = output<ClientFormData>();
  readonly close = output<void>();

  protected form: ClientFormData = { name: '', cedula: '', email: '', phone: '', address: '' };

  ngOnInit(): void {
    const client = this.client();
    if (client) {
      const { id, ...data } = client;
      this.form = { ...data };
    }
  }

  protected onSubmit(): void {
    this.save.emit({ ...this.form });
  }
}
