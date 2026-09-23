/**
 * Tipos tal como los devuelve el backend (Node + MySQL).
 * Nota: mysql2 devuelve DECIMAL/SUM como string y DATE como fecha ISO.
 */

export type ApiNumber = number | string;

export interface ApiError {
  error: string;
}

export interface ApiUsuario {
  sub: number;
  nombre_completo: string;
  correo: string;
  id_rol: number;
  nombre_rol: string;
}

export interface ApiLoginResponse {
  token: string;
  usuario: ApiUsuario;
}

export interface ApiCliente {
  id_cliente: number;
  nombre_completo: string;
  cedula: string;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
}

export type ApiClienteInput = Omit<ApiCliente, 'id_cliente'>;

export interface ApiEstado {
  id_estado: number;
  nombre_estado: string;
  orden: number;
}

export interface ApiTipoPago {
  id_tipo_pago: number;
  tipo_pago: string;
}

export interface ApiArreglo {
  id_arreglo: number;
  descripcion: string | null;
  fecha_ingreso: string;
  /** TIME de MySQL: "HH:MM:SS" */
  hora_ingreso: string | null;
  fecha_entrega: string | null;
  hora_entrega: string | null;
  valor: ApiNumber;
  id_cliente: number;
  id_estado: number;
  id_usuario: number | null;
  nombre_completo: string;
  cedula: string;
  correo: string | null;
  telefono: string | null;
  nombre_estado: string;
  estado_orden: number;
  usuario_nombre: string | null;
  pagado: ApiNumber;
  saldo_pendiente: ApiNumber;
  notificacion_correo?: { enviado: boolean; motivo?: string } | null;
}

export interface ApiArregloInput {
  descripcion: string | null;
  fecha_ingreso: string;
  hora_ingreso: string | null;
  fecha_entrega: string | null;
  hora_entrega: string | null;
  valor: number;
  id_cliente: number;
  id_estado?: number;
  id_usuario?: number | null;
}

export interface ApiPago {
  id_pago: number;
  monto: ApiNumber;
  fecha_pago: string;
  id_tipo_pago: number;
  id_arreglo: number;
  tipo_pago: string;
}

export interface ApiPagoInput {
  monto: number;
  fecha_pago: string;
  id_tipo_pago: number;
  id_arreglo: number;
}

export type ApiColorRecordatorio = 'blue' | 'green' | 'yellow' | 'red' | 'purple';

export interface ApiRecordatorio {
  id_recordatorio: number;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  /** "HH:MM:SS" */
  hora: string;
  color: ApiColorRecordatorio;
  id_usuario: number | null;
  usuario_nombre: string | null;
  creado_en: string;
}

export interface ApiRecordatorioInput {
  titulo: string;
  descripcion: string | null;
  fecha: string;
  hora: string;
  color: ApiColorRecordatorio;
}

// ---------- Reportes ----------

interface ApiRango {
  desde: string;
  hasta: string;
}

export interface ApiConteoEstado {
  nombre_estado: string;
  total: ApiNumber;
}

export interface ApiReporteResumen extends ApiRango {
  totales: {
    arreglos_periodo: ApiNumber;
    valor_total: ApiNumber;
    cobrado: ApiNumber;
    pendiente: ApiNumber;
    clientes_activos: ApiNumber;
  };
  porEstado: ApiConteoEstado[];
  ingresosPorMes: { mes: string; cobrado: ApiNumber; facturado: ApiNumber }[];
}

export interface ApiArregloReporte {
  id_arreglo: number;
  descripcion: string | null;
  fecha_ingreso: string;
  fecha_entrega: string | null;
  valor: ApiNumber;
  id_cliente: number;
  nombre_completo: string;
  nombre_estado: string;
  pagado: ApiNumber;
  pendiente: ApiNumber;
}

export interface ApiReporteIngresos extends ApiRango {
  detalle: ApiArregloReporte[];
  porMes: { mes: string; cobrado: ApiNumber; pendiente: ApiNumber }[];
  totales: { valor: ApiNumber; pagado: ApiNumber; pendiente: ApiNumber };
}

export interface ApiReporteArreglos extends ApiRango {
  porEstado: ApiConteoEstado[];
  porMes: { mes: string; total: ApiNumber }[];
  listado: Pick<
    ApiArregloReporte,
    'id_arreglo' | 'nombre_completo' | 'descripcion' | 'nombre_estado' | 'fecha_ingreso' | 'fecha_entrega'
  >[];
}

export interface ApiReporteClientes extends ApiRango {
  topClientes: { id_cliente: number; nombre_completo: string; total_arreglos: ApiNumber }[];
  resumenPorCliente: {
    id_cliente: number;
    nombre_completo: string;
    total_arreglos: ApiNumber;
    total_facturado: ApiNumber;
    total_cobrado: ApiNumber;
    saldo: ApiNumber;
  }[];
  todosClientes: Pick<ApiCliente, 'id_cliente' | 'nombre_completo' | 'cedula' | 'telefono' | 'correo'>[];
}

export type ReportType = 'resumen' | 'ingresos' | 'arreglos' | 'clientes';
