// Base: ms-erp/src/main/resources/graphql/schema.graphqls at backend commit6e750faa (read-only).
// Base SHA-256: 9b41bc3185c8db00e6890c233221eebd0b82f7d8b30c059188dd67a3a8a38562
// Additive patient readback verified at496e64eed48841998aea7b029ccf45b7adacf27c:
// Paciente.fechaNacimiento: Date and Paciente.genero: String, both nullable.
// All unrelated snapshot definitions remain unchanged; this is not a wholesale SDL refresh.
// Whitespace/descriptions compacted below; names, types, defaults and nullability preserved.
// Refresh deliberately from the backend source; never change this to accommodate frontend documents.
export const MS1_SCHEMA_SDL = `
schema { query: Query mutation: Mutation }
scalar BigDecimal
scalar Date
scalar DateTime
scalar UUID

enum EstadoCuota { ANULADA PAGADA PENDIENTE VENCIDA }
enum EstadoOrdenCobro { ANULADO PAGADO PARCIAL PENDIENTE }
enum MetodoPago { EFECTIVO QR_PAGOFACIL TRANSFERENCIA }
enum ModalidadPago { CONTADO CREDITO }
enum TipoMovimientoCaja { EGRESO INGRESO }

type AuditLog { accion: String! createdAt: DateTime! detalleJson: String entidadAfectada: String! entidadId: UUID id: UUID! }
type Consultorio { codigo: String! estado: String! id: UUID! nombre: String! ubicacion: String }
type CuotaPago { estado: EstadoCuota! fechaPago: DateTime fechaVencimiento: Date! id: UUID! montoCuotaBs: BigDecimal! numeroCuota: Int! }
type EmpresaConfig { direccion: String! emailContacto: String id: UUID! monedaSimbolo: String! nit: String! nombreComercial: String! razonSocial: String! telefonoContacto: String! }
type Especialidad { activo: Boolean! codigo: String! descripcion: String id: UUID! nombre: String! }
type MovimientoCaja { categoria: String! descripcion: String! fechaMovimiento: DateTime! id: UUID! metodoPago: MetodoPago! montoBs: BigDecimal! recibo: Recibo tipoMovimiento: TipoMovimientoCaja! }
type Odontologo { activo: Boolean! apellidos: String! ci: String! email: String especialidades: [Especialidad!]! id: UUID! matriculaProfesional: String! nombres: String! porcentajeComision: BigDecimal! telefono: String! }
type OrdenCobro { cantidadCuotas: Int! consultaExternaId: UUID createdAt: DateTime! cuotas: [CuotaPago!]! descuentoBs: BigDecimal! estado: EstadoOrdenCobro! id: UUID! items: [OrdenCobroItem!]! modalidadPago: ModalidadPago! montoSubtotalBs: BigDecimal! montoTotalBs: BigDecimal! odontologo: Odontologo paciente: Paciente! saldoPendienteBs: BigDecimal! }
type OrdenCobroItem { cantidad: Int! id: UUID! piezaDental: String precioUnitarioBs: BigDecimal! servicio: ServicioOdontologico! subtotalBs: BigDecimal! }
type Paciente { activo: Boolean! apellidos: String! ciNit: String! direccion: String email: String fechaNacimiento: Date genero: String id: UUID! nombres: String! telefonoWhatsapp: String! }
type Recibo { ciNitCliente: String! concepto: String! enviadoWhatsapp: Boolean! fechaEmision: DateTime! id: UUID! montoTotalBs: BigDecimal! numeroRecibo: String! pdfUrlS3: String razonSocialCliente: String! }
type ReporteGenerativoPayload { reporteId: UUID! consultaSqlEjecutada: String! columnas: [String!]! filasJson: String! tipoGraficoSugerido: String! urlDescargaExcel: String! urlDescargaPdf: String! }
type AgenteInteraccionResponse { interaccionId: UUID! fechaEjecucion: DateTime! instruccionOriginal: String! respuestaNaturalAgente: String! toolsMcpInvocadas: [String!]! accionCrudEjecutada: String notificacionN8nEnviada: Boolean! reporteGenerado: ReporteGenerativoPayload }
type McpServerStatus { activo: Boolean! protocolVersion: String! toolsRegistradas: [McpToolMetadata!]! }
type McpToolMetadata { nombre: String! categoria: String! descripcion: String! }
type ResumenFlujoCaja { movimientos: [MovimientoCaja!]! saldoNetoBs: BigDecimal! totalEgresosBs: BigDecimal! totalIngresosBs: BigDecimal! }
type Rol { codigo: String! id: UUID! nombre: String! permisos: [String!]! }
type ServicioOdontologico { activo: Boolean! codigo: String! descripcion: String especialidad: Especialidad id: UUID! nombre: String! precioBaseBs: BigDecimal! }
type TransaccionQr { cuotaId: UUID! estado: String! fechaExpiracion: DateTime id: UUID! montoBs: BigDecimal! pagofacilTransactionId: String! qrImagenBase64: String! }
type Usuario { activo: Boolean! email: String! id: UUID! nombreCompleto: String! rol: Rol! username: String! }

type Query {
  listarHistorialAgente(limite: Int = 20): [AgenteInteraccionResponse!]!
  obtenerEstadoServidorMcp: McpServerStatus!
  listarAuditLogs(limite: Int = 50): [AuditLog!]!
  listarConsultorios: [Consultorio!]!
  listarCuotasPendientesPorPaciente(pacienteId: UUID!): [CuotaPago!]!
  listarEspecialidades: [Especialidad!]!
  listarOdontologos(soloActivos: Boolean = true): [Odontologo!]!
  listarOrdenesCobro(estado: EstadoOrdenCobro, pacienteId: UUID): [OrdenCobro!]!
  listarPacientes(busqueda: String): [Paciente!]!
  listarRoles: [Rol!]!
  listarServiciosOdontologicos(especialidadId: UUID): [ServicioOdontologico!]!
  listarUsuarios: [Usuario!]!
  obtenerConfiguracionEmpresa: EmpresaConfig!
  obtenerFlujoCaja(fechaFin: DateTime!, fechaInicio: DateTime!): ResumenFlujoCaja!
  obtenerOrdenCobroDetalle(id: UUID!): OrdenCobro
  obtenerPacientePorId(id: UUID!): Paciente
}
type Mutation {
  ejecutarAgenteErp(instruccion: String!, modoAutonomoMonitoreo: Boolean = false): AgenteInteraccionResponse!
  actualizarConfiguracionEmpresa(input: EmpresaConfigInput!): EmpresaConfig!
  actualizarConsultorio(id: UUID!, input: ActualizarConsultorioInput!): Consultorio!
  actualizarEspecialidad(id: UUID!, input: ActualizarEspecialidadInput!): Especialidad!
  actualizarOdontologo(id: UUID!, input: ActualizarOdontologoInput!): Odontologo!
  actualizarPaciente(id: UUID!, input: ActualizarPacienteInput!): Paciente!
  actualizarServicioOdontologico(id: UUID!, input: ActualizarServicioInput!): ServicioOdontologico!
  actualizarUsuario(id: UUID!, input: ActualizarUsuarioInput!): Usuario!
  cobrarCuotaEnEfectivo(input: CobrarEfectivoInput!): Recibo!
  configurarPlanDePagos(input: ConfigurarPlanPagosInput!): OrdenCobro!
  crearConsultorio(input: CrearConsultorioInput!): Consultorio!
  crearEspecialidad(codigo: String!, descripcion: String, nombre: String!): Especialidad!
  crearOdontologo(input: CrearOdontologoInput!): Odontologo!
  crearOrdenCobroManual(input: CrearOrdenCobroInput!): OrdenCobro!
  crearPaciente(input: CrearPacienteInput!): Paciente!
  crearServicioOdontologico(input: CrearServicioInput!): ServicioOdontologico!
  crearUsuario(input: CrearUsuarioInput!): Usuario!
  eliminarConsultorio(id: UUID!): Boolean!
  eliminarEspecialidad(id: UUID!): Boolean!
  eliminarOdontologo(id: UUID!): Boolean!
  eliminarPaciente(id: UUID!): Boolean!
  eliminarServicioOdontologico(id: UUID!): Boolean!
  generarQrPagoFacil(ciNitCliente: String!, cuotaId: UUID!, razonSocialCliente: String!): TransaccionQr!
  registrarEgresoCaja(input: RegistrarEgresoInput!): MovimientoCaja!
  simularConfirmacionQrDev(pagofacilTransactionId: String!): Recibo!
}
input ActualizarConsultorioInput { codigo: String! estado: String nombre: String! ubicacion: String }
input ActualizarEspecialidadInput { codigo: String! descripcion: String nombre: String! }
input ActualizarOdontologoInput { apellidos: String! ci: String! email: String especialidadesIds: [UUID!]! matriculaProfesional: String! nombres: String! porcentajeComision: BigDecimal! telefono: String! }
input ActualizarPacienteInput { apellidos: String! ciNit: String! direccion: String email: String fechaNacimiento: Date genero: String nombres: String! telefonoWhatsapp: String! }
input ActualizarServicioInput { codigo: String! descripcion: String especialidadId: UUID nombre: String! precioBaseBs: BigDecimal! }
input ActualizarUsuarioInput { activo: Boolean! email: String nombreCompleto: String rolCodigo: String! }
input CobrarEfectivoInput { ciNitCliente: String! cuotaId: UUID! razonSocialCliente: String! usuarioCajeroId: UUID! }
input ConfigurarPlanPagosInput { cantidadCuotas: Int! descuentoBs: BigDecimal = 0 fechaPrimeraCuota: Date! intervaloDias: Int = 30 modalidadPago: ModalidadPago! ordenCobroId: UUID! }
input CrearConsultorioInput { codigo: String! nombre: String! ubicacion: String }
input CrearOdontologoInput { apellidos: String! ci: String! email: String especialidadesIds: [UUID!]! matriculaProfesional: String! nombres: String! porcentajeComision: BigDecimal! telefono: String! }
input CrearOrdenCobroInput { descuentoBs: BigDecimal = 0 items: [OrdenCobroItemInput!]! observaciones: String odontologoId: UUID pacienteId: UUID! }
input CrearPacienteInput { apellidos: String! ciNit: String! direccion: String email: String fechaNacimiento: Date genero: String nombres: String! telefonoWhatsapp: String! }
input CrearServicioInput { codigo: String! descripcion: String especialidadId: UUID nombre: String! precioBaseBs: BigDecimal! }
input CrearUsuarioInput { email: String! nombreCompleto: String! password: String! rolCodigo: String! username: String! }
input EmpresaConfigInput { direccion: String! emailContacto: String nit: String! nombreComercial: String! razonSocial: String! telefonoContacto: String! }
input OrdenCobroItemInput { cantidad: Int! piezaDental: String servicioId: UUID! }
input RegistrarEgresoInput { categoria: String! descripcion: String! metodoPago: MetodoPago! montoBs: BigDecimal! usuarioCajeroId: UUID! }
`;
