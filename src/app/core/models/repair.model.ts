import { ApiArreglo, ApiPago } from './api.model';
import { toDateKey } from '../utils/date.utils';

export type RepairStatus = 'pendiente' | 'en_proceso' | 'listo' | 'entregado';

export type PaymentMethod = 'efectivo' | 'transferencia' | 'nequi' | 'daviplata' | 'tarjeta' | 'otro';

export interface Repair {
  id: number;
  /** Código visible: R001, R002... */
  code: string;
  clientId: number;
  clientName: string;
  clientCedula: string;
  clientPhone: string;
  description: string;
  statusId: number;
  status: RepairStatus;
  /** yyyy-MM-dd */
  receivedDate: string;
  /** HH:mm (null en arreglos registrados antes de guardar horas) */
  receivedTime: string | null;
  /** yyyy-MM-dd (puede no tener fecha de entrega) */
  deliveryDate: string | null;
  /** HH:mm */
  deliveryTime: string | null;
  cost: number;
  paid: number;
  balance: number;
}

export interface RepairFormData {
  clientId: number;
  description: string;
  status: RepairStatus;
  receivedDate: string;
  receivedTime: string;
  deliveryDate: string;
  deliveryTime: string;
  cost: number;
}

export interface Payment {
  id: number;
  repairId: number;
  amount: number;
  /** yyyy-MM-dd */
  date: string;
  method: PaymentMethod;
  methodLabel: string;
}

export const REPAIR_STATUSES: RepairStatus[] = ['pendiente', 'en_proceso', 'listo', 'entregado'];

/** Etiquetas tal como aparecen en badges, calendario e informes. */
export const STATUS_LABELS: Record<RepairStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En Taller',
  listo: 'Listo',
  entregado: 'Entregado',
};

/** Colores usados en las gráficas de informes. */
export const STATUS_COLORS: Record<RepairStatus, string> = {
  pendiente: '#f59e0b',
  en_proceso: '#3b82f6',
  listo: '#10b981',
  entregado: '#6366f1',
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'daviplata', label: 'Daviplata' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
];

/**
 * Métodos que se pueden elegir al registrar un pago (arreglos y detalle de cliente).
 * PAYMENT_METHODS conserva todos para mostrar correctamente pagos antiguos (Nequi, Daviplata...).
 */
export const SELECTABLE_PAYMENT_METHODS: PaymentMethod[] = ['efectivo', 'tarjeta', 'transferencia'];

/** Método que queda seleccionado por defecto al registrar un pago. */
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'efectivo';

/** Convierte el estado a sufijo de clase CSS (en_proceso -> en-proceso). */
export function statusClass(status: RepairStatus | 'recordatorio'): string {
  return status.replace('_', '-');
}

/** Normaliza un nombre del backend: "En Proceso" -> "en_proceso", "Daviplata" -> "daviplata". */
export function toKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function repairCode(id: number): string {
  return `R${String(id).padStart(3, '0')}`;
}

export function mapRepair(api: ApiArreglo): Repair {
  return {
    id: api.id_arreglo,
    code: repairCode(api.id_arreglo),
    clientId: api.id_cliente,
    clientName: api.nombre_completo,
    clientCedula: api.cedula ?? '',
    clientPhone: api.telefono ?? '',
    description: api.descripcion ?? '',
    statusId: api.id_estado,
    status: toKey(api.nombre_estado) as RepairStatus,
    receivedDate: toDateKey(api.fecha_ingreso),
    receivedTime: api.hora_ingreso ? api.hora_ingreso.slice(0, 5) : null,
    deliveryDate: api.fecha_entrega ? toDateKey(api.fecha_entrega) : null,
    deliveryTime: api.hora_entrega ? api.hora_entrega.slice(0, 5) : null,
    cost: Number(api.valor),
    paid: Number(api.pagado),
    balance: Number(api.saldo_pendiente),
  };
}

export function mapPayment(api: ApiPago): Payment {
  return {
    id: api.id_pago,
    repairId: api.id_arreglo,
    amount: Number(api.monto),
    date: toDateKey(api.fecha_pago),
    method: toKey(api.tipo_pago) as PaymentMethod,
    methodLabel: api.tipo_pago,
  };
}
