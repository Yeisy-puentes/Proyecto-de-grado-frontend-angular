import { ApiCliente, ApiClienteInput } from './api.model';

export interface Client {
  id: number;
  name: string;
  cedula: string;
  email: string;
  phone: string;
  address: string;
}

/** Datos del formulario de cliente (sin id, lo asigna el backend). */
export type ClientFormData = Omit<Client, 'id'>;

export function mapClient(api: ApiCliente): Client {
  return {
    id: api.id_cliente,
    name: api.nombre_completo,
    cedula: api.cedula,
    email: api.correo ?? '',
    phone: api.telefono ?? '',
    address: api.direccion ?? '',
  };
}

export function toApiClient(data: ClientFormData): ApiClienteInput {
  return {
    nombre_completo: data.name.trim(),
    cedula: data.cedula.trim(),
    correo: data.email.trim(),
    telefono: data.phone.trim(),
    direccion: data.address.trim(),
  };
}
