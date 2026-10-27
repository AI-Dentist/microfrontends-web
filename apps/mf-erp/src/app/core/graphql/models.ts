// Raw MS1 DTOs, not UI adapters. See ms1-schema.ts for approved SDL provenance.
// Date: yyyy-MM-dd. DateTime: ISO-8601 with offset (including Z). UUIDs remain strings.
export type UUID = string;
export type DateScalar = string;
export type DateTime = string;
export type BigDecimal = number;
export type BigDecimalInput = number | string;
export type EstadoOrdenCobro = 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANULADO';
export type EstadoCuota = 'PENDIENTE' | 'PAGADA' | 'VENCIDA' | 'ANULADA';
export type ModalidadPago = 'CONTADO' | 'CREDITO';
export type MetodoPago = 'EFECTIVO' | 'QR_PAGOFACIL' | 'TRANSFERENCIA';
export type TipoMovimientoCaja = 'INGRESO' | 'EGRESO';
// These backend fields are free text, not GraphQL enums.
export type TipoGrafico = string;
export type EstadoQr = string;
export type CategoriaEgreso = string;
export type TipoPago = ModalidadPago;
export type TipoMovimiento = TipoMovimientoCaja;

export interface Paciente {
  id: UUID;
  ciNit: string;
  nombres: string;
  apellidos: string;
  telefonoWhatsapp: string;
  email: string | null;
  direccion: string | null;
  // Missing in legacy cached rows: unknown is not the same as explicit null.
  fechaNacimiento?: DateScalar | null;
  genero?: string | null;
  activo: boolean;
}

export interface Especialidad {
  id: UUID;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface Odontologo {
  id: UUID;
  ci: string;
  matriculaProfesional: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  email: string | null;
  porcentajeComision: BigDecimal;
  especialidades: Especialidad[];
  activo: boolean;
}

export interface Consultorio {
  id: UUID;
  codigo: string;
  nombre: string;
  ubicacion: string | null;
  estado: string;
}

export interface ServicioOdontologico {
  id: UUID;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precioBaseBs: BigDecimal;
  especialidad: Especialidad | null;
  activo: boolean;
}

export interface EmpresaConfig {
  id: UUID;
  nombreComercial: string;
  razonSocial: string;
  nit: string;
  direccion: string;
  telefonoContacto: string;
  emailContacto: string | null;
  monedaSimbolo: string;
}

export interface Rol {
  id: UUID;
  codigo: string;
  nombre: string;
  permisos: string[];
}

export interface Usuario {
  id: UUID;
  username: string;
  email: string;
  nombreCompleto: string;
  rol: Rol;
  activo: boolean;
}

export interface AuditLog {
  id: UUID;
  accion: string;
  entidadAfectada: string;
  entidadId: UUID | null;
  detalleJson: string | null;
  createdAt: DateTime;
}

export interface CuotaPago {
  id: UUID;
  numeroCuota: number;
  montoCuotaBs: BigDecimal;
  fechaVencimiento: DateScalar;
  estado: EstadoCuota;
  fechaPago: DateTime | null;
}

export interface OrdenCobroItem {
  id: UUID;
  servicio: ServicioOdontologico;
  piezaDental: string | null;
  cantidad: number;
  precioUnitarioBs: BigDecimal;
  subtotalBs: BigDecimal;
}

export interface OrdenCobro {
  id: UUID;
  consultaExternaId: UUID | null;
  paciente: Paciente;
  odontologo: Odontologo | null;
  modalidadPago: ModalidadPago;
  montoSubtotalBs: BigDecimal;
  descuentoBs: BigDecimal;
  montoTotalBs: BigDecimal;
  saldoPendienteBs: BigDecimal;
  cantidadCuotas: number;
  estado: EstadoOrdenCobro;
  createdAt: DateTime;
  items: OrdenCobroItem[];
  cuotas: CuotaPago[];
}

export interface Recibo {
  id: UUID;
  numeroRecibo: string;
  ciNitCliente: string;
  razonSocialCliente: string;
  concepto: string;
  montoTotalBs: BigDecimal;
  pdfUrlS3: string | null;
  enviadoWhatsapp: boolean;
  fechaEmision: DateTime;
}

export interface TransaccionQr {
  id: UUID;
  cuotaId: UUID;
  pagofacilTransactionId: string;
  qrImagenBase64: string;
  montoBs: BigDecimal;
  estado: EstadoQr;
  fechaExpiracion: DateTime | null;
}

export interface MovimientoCaja {
  id: UUID;
  tipoMovimiento: TipoMovimientoCaja;
  categoria: string;
  metodoPago: MetodoPago;
  montoBs: BigDecimal;
  descripcion: string;
  fechaMovimiento: DateTime;
  recibo: Recibo | null;
}

export interface ResumenFlujoCaja {
  totalIngresosBs: BigDecimal;
  totalEgresosBs: BigDecimal;
  saldoNetoBs: BigDecimal;
  movimientos: MovimientoCaja[];
}

export interface ReporteGenerativoPayload {
  reporteId: UUID;
  consultaSqlEjecutada: string;
  columnas: string[];
  filasJson: string;
  tipoGraficoSugerido: TipoGrafico;
  urlDescargaExcel: string;
  urlDescargaPdf: string;
}

// Optional inputs accept omission or explicit null, as in the SDL.
export interface CrearPacienteInput {
  ciNit: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento?: DateScalar | null;
  genero?: string | null;
  telefonoWhatsapp: string;
  email?: string | null;
  direccion?: string | null;
}
export interface ActualizarPacienteInput extends CrearPacienteInput {}

export interface CrearOdontologoInput {
  ci: string;
  matriculaProfesional: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  email?: string | null;
  porcentajeComision: BigDecimalInput;
  especialidadesIds: UUID[];
}
export interface ActualizarOdontologoInput extends CrearOdontologoInput {}

// crearEspecialidad takes these as loose arguments; no CrearEspecialidadInput exists in GraphQL.
export interface CrearEspecialidadArgs {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
}
export interface ActualizarEspecialidadInput {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
}

export interface CrearConsultorioInput {
  codigo: string;
  nombre: string;
  ubicacion?: string | null;
}
export interface ActualizarConsultorioInput extends CrearConsultorioInput {
  // Omitted retains current state; valid values: DISPONIBLE, MANTENIMIENTO, INACTIVO.
  estado?: string | null;
}

export interface CrearServicioInput {
  especialidadId?: UUID | null;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  precioBaseBs: BigDecimalInput;
}
export interface ActualizarServicioInput extends CrearServicioInput {}

export interface EmpresaConfigInput {
  nombreComercial: string;
  razonSocial: string;
  nit: string;
  direccion: string;
  telefonoContacto: string;
  emailContacto?: string | null;
}

export interface CrearUsuarioInput {
  rolCodigo: string;
  username: string;
  email: string;
  nombreCompleto: string;
  password: string;
}
export interface ActualizarUsuarioInput {
  rolCodigo: string;
  activo: boolean;
  nombreCompleto?: string | null;
  email?: string | null;
}

export interface OrdenCobroItemInput {
  servicioId: UUID;
  piezaDental?: string | null;
  cantidad: number;
}
export interface CrearOrdenCobroInput {
  pacienteId: UUID;
  odontologoId?: UUID | null;
  items: OrdenCobroItemInput[];
  descuentoBs?: BigDecimalInput | null;
  observaciones?: string | null;
}
export interface ConfigurarPlanPagosInput {
  ordenCobroId: UUID;
  modalidadPago: ModalidadPago;
  descuentoBs?: BigDecimalInput | null;
  cantidadCuotas: number;
  fechaPrimeraCuota: DateScalar;
  intervaloDias?: number | null;
}
export interface CobrarEfectivoInput {
  cuotaId: UUID;
  usuarioCajeroId: UUID;
  ciNitCliente: string;
  razonSocialCliente: string;
}
export interface GenerarQrPagoFacilArgs {
  cuotaId: UUID;
  ciNitCliente: string;
  razonSocialCliente: string;
}
export interface RegistrarEgresoInput {
  usuarioCajeroId: UUID;
  categoria: string;
  metodoPago: MetodoPago;
  montoBs: BigDecimalInput;
  descripcion: string;
}

// TS-only migration names. GraphQL documents always use the real schema names.
export type ConfiguracionEmpresa = EmpresaConfig;
export type UsuarioSistema = Usuario;
export type LogAuditoria = AuditLog;
export type Cuota = CuotaPago;
export type QrPagoFacil = TransaccionQr;
export type ResumenCaja = ResumenFlujoCaja;
export type PacienteInput = CrearPacienteInput;
export type OdontologoInput = CrearOdontologoInput;
export type EspecialidadInput = CrearEspecialidadArgs;
export type ConsultorioInput = CrearConsultorioInput;
export type ServicioOdontologicoInput = CrearServicioInput;
export type CrearOrdenCobroManualInput = CrearOrdenCobroInput;
export type ConfigurarPlanDePagosInput = ConfigurarPlanPagosInput;
export type CobrarCuotaEnEfectivoInput = CobrarEfectivoInput;
export type RegistrarEgresoCajaInput = RegistrarEgresoInput;

/** Actual unified MS1 agent response; CRUD summary is a nullable string. */
export interface AgenteInteraccionResponse {
  interaccionId: UUID;
  fechaEjecucion: DateTime;
  instruccionOriginal: string;
  respuestaNaturalAgente: string;
  toolsMcpInvocadas: string[];
  accionCrudEjecutada: string | null;
  notificacionN8nEnviada: boolean;
  reporteGenerado: ReporteGenerativoPayload | null;
}
export interface McpServerStatus {
  activo: boolean;
  protocolVersion: string;
  toolsRegistradas: { nombre: string; categoria: string; descripcion: string }[];
}
