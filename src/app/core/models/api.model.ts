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
  /** Solo al crear: el backend guarda el arreglo y el abono en una sola transacción. */
  abono_inicial?: { monto: number; id_tipo_pago: number; fecha_pago: string };
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

/** Cómo se agrupan las gráficas y tablas por período. */
export type ReportGrouping = 'dia' | 'semana' | 'mes';

/** Período: 'yyyy-MM-dd' (día o lunes de la semana) o 'yyyy-MM' (mes). */
export interface ApiIngresoPeriodo {
  periodo: string;
  cobrado: ApiNumber;
  pagos: ApiNumber;
}

export interface ApiReporteResumen extends ApiRango {
  agrupacion: ReportGrouping;
  totales: {
    arreglos_periodo: ApiNumber;
    valor_total: ApiNumber;
    /** Dinero recibido en el período (por fecha de pago). */
    cobrado: ApiNumber;
    /** Saldo de los arreglos recibidos en el período. */
    pendiente: ApiNumber;
    clientes_activos: ApiNumber;
  };
  porEstado: ApiConteoEstado[];
  ingresosPorPeriodo: ApiIngresoPeriodo[];
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

/** Un pago recibido en el período (detalle de ingresos). */
export interface ApiPagoReporte {
  id_pago: number;
  monto: ApiNumber;
  fecha_pago: string;
  id_arreglo: number;
  tipo_pago: string;
  descripcion: string | null;
  id_cliente: number;
  nombre_completo: string;
}

export interface ApiReporteIngresos extends ApiRango {
  agrupacion: ReportGrouping;
  detalle: ApiPagoReporte[];
  porPeriodo: ApiIngresoPeriodo[];
  porTipoPago: { tipo_pago: string; cobrado: ApiNumber; pagos: ApiNumber }[];
  totales: { cobrado: ApiNumber; pagos: ApiNumber };
}

export interface ApiReporteArreglos extends ApiRango {
  agrupacion: ReportGrouping;
  porEstado: ApiConteoEstado[];
  porPeriodo: { periodo: string; total: ApiNumber }[];
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
