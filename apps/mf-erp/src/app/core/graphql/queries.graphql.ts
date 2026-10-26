import { gql } from 'apollo-angular';
import type {
  AuditLog, Consultorio, CuotaPago, DateTime, EmpresaConfig, Especialidad, EstadoOrdenCobro,
  Odontologo, OrdenCobro, Paciente, AgenteInteraccionResponse, McpServerStatus, ResumenFlujoCaja, Rol,
  ServicioOdontologico, Usuario, UUID,
} from './models';

// Shared raw selections keep each result aligned with its full DTO, including nested DTOs.
export const PACIENTE_FIELDS = 'id ciNit nombres apellidos telefonoWhatsapp email direccion fechaNacimiento genero activo';
export const ESPECIALIDAD_FIELDS = 'id codigo nombre descripcion activo';
export const ODONTOLOGO_FIELDS = `id ci matriculaProfesional nombres apellidos telefono email porcentajeComision activo
  especialidades { ${ESPECIALIDAD_FIELDS} }`;
export const CONSULTORIO_FIELDS = 'id codigo nombre ubicacion estado';
export const SERVICIO_FIELDS = `id codigo nombre descripcion precioBaseBs activo especialidad { ${ESPECIALIDAD_FIELDS} }`;
export const EMPRESA_FIELDS = 'id nombreComercial razonSocial nit direccion telefonoContacto emailContacto monedaSimbolo';
export const ROL_FIELDS = 'id codigo nombre permisos';
export const USUARIO_FIELDS = `id username email nombreCompleto activo rol { ${ROL_FIELDS} }`;
export const CUOTA_FIELDS = 'id numeroCuota montoCuotaBs fechaVencimiento estado fechaPago';
// pdfUrlS3 is nullable and role-protected (ADMIN/CAJERO); download its signed URL without auth headers.
export const RECIBO_FIELDS = 'id numeroRecibo ciNitCliente razonSocialCliente concepto montoTotalBs pdfUrlS3 enviadoWhatsapp fechaEmision';
export const MOVIMIENTO_FIELDS = `id tipoMovimiento categoria metodoPago montoBs descripcion fechaMovimiento
  recibo { ${RECIBO_FIELDS} }`;
export const QR_FIELDS = 'id cuotaId pagofacilTransactionId qrImagenBase64 montoBs estado fechaExpiracion';
export const ORDEN_COBRO_FIELDS = `id consultaExternaId modalidadPago montoSubtotalBs descuentoBs montoTotalBs
  saldoPendienteBs cantidadCuotas estado createdAt
  paciente { ${PACIENTE_FIELDS} }
  odontologo { ${ODONTOLOGO_FIELDS} }
  items { id piezaDental cantidad precioUnitarioBs subtotalBs servicio { ${SERVICIO_FIELDS} } }
  cuotas { ${CUOTA_FIELDS} }`;

export const LISTAR_PACIENTES = gql<{ listarPacientes: Paciente[] }, { busqueda?: string | null }>`
  query ListarPacientes($busqueda: String) {
    listarPacientes(busqueda: $busqueda) { ${PACIENTE_FIELDS} }
  }
`;

export const OBTENER_PACIENTE_POR_ID = gql<{ obtenerPacientePorId: Paciente | null }, { id: UUID }>`
  query ObtenerPacientePorId($id: UUID!) {
    obtenerPacientePorId(id: $id) { ${PACIENTE_FIELDS} }
  }
`;

export const LISTAR_ODONTOLOGOS = gql<{ listarOdontologos: Odontologo[] }, { soloActivos?: boolean | null }>`
  query ListarOdontologos($soloActivos: Boolean) {
    listarOdontologos(soloActivos: $soloActivos) { ${ODONTOLOGO_FIELDS} }
  }
`;

export const LISTAR_ESPECIALIDADES = gql<{ listarEspecialidades: Especialidad[] }, Record<string, never>>`
  query ListarEspecialidades {
    listarEspecialidades { ${ESPECIALIDAD_FIELDS} }
  }
`;

export const LISTAR_CONSULTORIOS = gql<{ listarConsultorios: Consultorio[] }, Record<string, never>>`
  query ListarConsultorios {
    listarConsultorios { ${CONSULTORIO_FIELDS} }
  }
`;

export const LISTAR_SERVICIOS_ODONTOLOGICOS = gql<
  { listarServiciosOdontologicos: ServicioOdontologico[] },
  { especialidadId?: UUID | null }
>`
  query ListarServiciosOdontologicos($especialidadId: UUID) {
    listarServiciosOdontologicos(especialidadId: $especialidadId) { ${SERVICIO_FIELDS} }
  }
`;

export const OBTENER_CONFIGURACION_EMPRESA = gql<{ obtenerConfiguracionEmpresa: EmpresaConfig }, Record<string, never>>`
  query ObtenerConfiguracionEmpresa {
    obtenerConfiguracionEmpresa { ${EMPRESA_FIELDS} }
  }
`;

export const LISTAR_USUARIOS = gql<{ listarUsuarios: Usuario[] }, Record<string, never>>`
  query ListarUsuarios {
    listarUsuarios { ${USUARIO_FIELDS} }
  }
`;

export const LISTAR_ROLES = gql<{ listarRoles: Rol[] }, Record<string, never>>`
  query ListarRoles {
    listarRoles { ${ROL_FIELDS} }
  }
`;

export const LISTAR_AUDIT_LOGS = gql<{ listarAuditLogs: AuditLog[] }, { limite?: number | null }>`
  query ListarAuditLogs($limite: Int) {
    listarAuditLogs(limite: $limite) { id accion entidadAfectada entidadId detalleJson createdAt }
  }
`;

export const LISTAR_ORDENES_COBRO = gql<
  { listarOrdenesCobro: OrdenCobro[] },
  { estado?: EstadoOrdenCobro | null; pacienteId?: UUID | null }
>`
  query ListarOrdenesCobro($estado: EstadoOrdenCobro, $pacienteId: UUID) {
    listarOrdenesCobro(estado: $estado, pacienteId: $pacienteId) { ${ORDEN_COBRO_FIELDS} }
  }
`;

export const OBTENER_ORDEN_COBRO_DETALLE = gql<{ obtenerOrdenCobroDetalle: OrdenCobro | null }, { id: UUID }>`
  query ObtenerOrdenCobroDetalle($id: UUID!) {
    obtenerOrdenCobroDetalle(id: $id) { ${ORDEN_COBRO_FIELDS} }
  }
`;

export const LISTAR_CUOTAS_PENDIENTES_POR_PACIENTE = gql<{ listarCuotasPendientesPorPaciente: CuotaPago[] }, { pacienteId: UUID }>`
  query ListarCuotasPendientesPorPaciente($pacienteId: UUID!) {
    listarCuotasPendientesPorPaciente(pacienteId: $pacienteId) { ${CUOTA_FIELDS} }
  }
`;

export const OBTENER_FLUJO_CAJA = gql<
  { obtenerFlujoCaja: ResumenFlujoCaja },
  { fechaInicio: DateTime; fechaFin: DateTime }
>`
  query ObtenerFlujoCaja($fechaInicio: DateTime!, $fechaFin: DateTime!) {
    obtenerFlujoCaja(fechaInicio: $fechaInicio, fechaFin: $fechaFin) {
      totalIngresosBs totalEgresosBs saldoNetoBs movimientos { ${MOVIMIENTO_FIELDS} }
    }
  }
`;


export const AGENTE_FIELDS = `
  interaccionId fechaEjecucion instruccionOriginal respuestaNaturalAgente
  toolsMcpInvocadas accionCrudEjecutada notificacionN8nEnviada
  reporteGenerado { reporteId consultaSqlEjecutada columnas filasJson tipoGraficoSugerido urlDescargaExcel urlDescargaPdf }
`;
export const LISTAR_HISTORIAL_AGENTE = gql<{ listarHistorialAgente: AgenteInteraccionResponse[] }, { limite: number }>`
  query ListarHistorialAgente($limite: Int = 20) {
    listarHistorialAgente(limite: $limite) { ${AGENTE_FIELDS} }
  }
`;
export const OBTENER_ESTADO_SERVIDOR_MCP = gql<{ obtenerEstadoServidorMcp: McpServerStatus }, Record<string, never>>`
  query ObtenerEstadoServidorMcp {
    obtenerEstadoServidorMcp { activo protocolVersion toolsRegistradas { nombre categoria descripcion } }
  }
`;
