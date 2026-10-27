import { gql } from 'apollo-angular';
import type { TypedDocumentNode } from '@apollo/client/core';
import type {
  AgenteInteraccionResponse, ActualizarOdontologoInput, ActualizarPacienteInput, ActualizarServicioInput,
  CobrarEfectivoInput, ConfigurarPlanPagosInput, Consultorio, CrearConsultorioInput,
  CrearEspecialidadArgs, CrearOdontologoInput, CrearOrdenCobroInput, CrearPacienteInput,
  CrearServicioInput, CrearUsuarioInput, EmpresaConfig, EmpresaConfigInput, Especialidad,
  GenerarQrPagoFacilArgs, MovimientoCaja, Odontologo, OrdenCobro, Paciente, Recibo,
  RegistrarEgresoInput, ServicioOdontologico, TransaccionQr, Usuario, UUID,
} from './models';
import {
  AGENTE_FIELDS, CONSULTORIO_FIELDS, EMPRESA_FIELDS, ESPECIALIDAD_FIELDS, MOVIMIENTO_FIELDS, ODONTOLOGO_FIELDS,
  ORDEN_COBRO_FIELDS, PACIENTE_FIELDS, QR_FIELDS, RECIBO_FIELDS, SERVICIO_FIELDS, USUARIO_FIELDS,
} from './queries.graphql';

// Preserve previous import locations for consumers while they migrate to the raw input names.
export type {
  CrearOrdenCobroInput, CrearOrdenCobroManualInput, ConfigurarPlanPagosInput, ConfigurarPlanDePagosInput,
  CobrarEfectivoInput, CobrarCuotaEnEfectivoInput, RegistrarEgresoInput, RegistrarEgresoCajaInput,
} from './models';

export const CREAR_PACIENTE = gql<{ crearPaciente: Paciente }, { input: CrearPacienteInput }>`
  mutation CrearPaciente($input: CrearPacienteInput!) {
    crearPaciente(input: $input) { ${PACIENTE_FIELDS} }
  }
`;

export const ACTUALIZAR_PACIENTE = gql<{ actualizarPaciente: Paciente }, { id: UUID; input: ActualizarPacienteInput }>`
  mutation ActualizarPaciente($id: UUID!, $input: ActualizarPacienteInput!) {
    actualizarPaciente(id: $id, input: $input) { ${PACIENTE_FIELDS} }
  }
`;

export const CREAR_ODONTOLOGO = gql<{ crearOdontologo: Odontologo }, { input: CrearOdontologoInput }>`
  mutation CrearOdontologo($input: CrearOdontologoInput!) {
    crearOdontologo(input: $input) { ${ODONTOLOGO_FIELDS} }
  }
`;

export const ACTUALIZAR_ODONTOLOGO = gql<{ actualizarOdontologo: Odontologo }, { id: UUID; input: ActualizarOdontologoInput }>`
  mutation ActualizarOdontologo($id: UUID!, $input: ActualizarOdontologoInput!) {
    actualizarOdontologo(id: $id, input: $input) { ${ODONTOLOGO_FIELDS} }
  }
`;

export const CREAR_ESPECIALIDAD = gql<{ crearEspecialidad: Especialidad }, CrearEspecialidadArgs>`
  mutation CrearEspecialidad($codigo: String!, $nombre: String!, $descripcion: String) {
    crearEspecialidad(codigo: $codigo, nombre: $nombre, descripcion: $descripcion) { ${ESPECIALIDAD_FIELDS} }
  }
`;

export const CREAR_CONSULTORIO = gql<{ crearConsultorio: Consultorio }, { input: CrearConsultorioInput }>`
  mutation CrearConsultorio($input: CrearConsultorioInput!) {
    crearConsultorio(input: $input) { ${CONSULTORIO_FIELDS} }
  }
`;

export const CREAR_SERVICIO_ODONTOLOGICO = gql<
  { crearServicioOdontologico: ServicioOdontologico }, { input: CrearServicioInput }
>`
  mutation CrearServicioOdontologico($input: CrearServicioInput!) {
    crearServicioOdontologico(input: $input) { ${SERVICIO_FIELDS} }
  }
`;

export const ACTUALIZAR_SERVICIO_ODONTOLOGICO = gql<
  { actualizarServicioOdontologico: ServicioOdontologico }, { id: UUID; input: ActualizarServicioInput }
>`
  mutation ActualizarServicioOdontologico($id: UUID!, $input: ActualizarServicioInput!) {
    actualizarServicioOdontologico(id: $id, input: $input) { ${SERVICIO_FIELDS} }
  }
`;

export const ACTUALIZAR_CONFIGURACION_EMPRESA = gql<
  { actualizarConfiguracionEmpresa: EmpresaConfig }, { input: EmpresaConfigInput }
>`
  mutation ActualizarConfiguracionEmpresa($input: EmpresaConfigInput!) {
    actualizarConfiguracionEmpresa(input: $input) { ${EMPRESA_FIELDS} }
  }
`;

export const CREAR_USUARIO = gql<{ crearUsuario: Usuario }, { input: CrearUsuarioInput }>`
  mutation CrearUsuario($input: CrearUsuarioInput!) {
    crearUsuario(input: $input) { ${USUARIO_FIELDS} }
  }
`;

export const CREAR_ORDEN_COBRO_MANUAL = gql<{ crearOrdenCobroManual: OrdenCobro }, { input: CrearOrdenCobroInput }>`
  mutation CrearOrdenCobroManual($input: CrearOrdenCobroInput!) {
    crearOrdenCobroManual(input: $input) { ${ORDEN_COBRO_FIELDS} }
  }
`;

export const CONFIGURAR_PLAN_DE_PAGOS = gql<{ configurarPlanDePagos: OrdenCobro }, { input: ConfigurarPlanPagosInput }>`
  mutation ConfigurarPlanDePagos($input: ConfigurarPlanPagosInput!) {
    configurarPlanDePagos(input: $input) { ${ORDEN_COBRO_FIELDS} }
  }
`;

export const COBRAR_CUOTA_EN_EFECTIVO = gql<{ cobrarCuotaEnEfectivo: Recibo }, { input: CobrarEfectivoInput }>`
  mutation CobrarCuotaEnEfectivo($input: CobrarEfectivoInput!) {
    cobrarCuotaEnEfectivo(input: $input) { ${RECIBO_FIELDS} }
  }
`;

export const GENERAR_QR_PAGOFACIL = gql<{ generarQrPagoFacil: TransaccionQr }, GenerarQrPagoFacilArgs>`
  mutation GenerarQrPagoFacil($cuotaId: UUID!, $ciNitCliente: String!, $razonSocialCliente: String!) {
    generarQrPagoFacil(cuotaId: $cuotaId, ciNitCliente: $ciNitCliente, razonSocialCliente: $razonSocialCliente) {
      ${QR_FIELDS}
    }
  }
`;

export const SIMULAR_CONFIRMACION_QR_DEV = gql<
  { simularConfirmacionQrDev: Recibo }, { pagofacilTransactionId: string }
>`
  mutation SimularConfirmacionQrDev($pagofacilTransactionId: String!) {
    simularConfirmacionQrDev(pagofacilTransactionId: $pagofacilTransactionId) { ${RECIBO_FIELDS} }
  }
`;

export const REGISTRAR_EGRESO_CAJA = gql<{ registrarEgresoCaja: MovimientoCaja }, { input: RegistrarEgresoInput }>`
  mutation RegistrarEgresoCaja($input: RegistrarEgresoInput!) {
    registrarEgresoCaja(input: $input) { ${MOVIMIENTO_FIELDS} }
  }
`;

/** Keys and operation names are persisted in the offline queue; do not rename them. */
export const OFFLINE_REPLAYABLE_MUTATIONS = {
  CobrarCuotaEnEfectivo: COBRAR_CUOTA_EN_EFECTIVO,
  RegistrarEgresoCaja: REGISTRAR_EGRESO_CAJA,
  CrearOrdenCobroManual: CREAR_ORDEN_COBRO_MANUAL,
  CrearPaciente: CREAR_PACIENTE,
} satisfies Record<string, TypedDocumentNode<any, any>>;

export type OfflineMutationName = keyof typeof OFFLINE_REPLAYABLE_MUTATIONS;

export const EJECUTAR_AGENTE_ERP = gql<
  { ejecutarAgenteErp: AgenteInteraccionResponse },
  { instruccion: string; modoAutonomoMonitoreo: boolean }
>`
  mutation EjecutarAgenteErp($instruccion: String!, $modoAutonomoMonitoreo: Boolean = false) {
    ejecutarAgenteErp(instruccion: $instruccion, modoAutonomoMonitoreo: $modoAutonomoMonitoreo) { ${AGENTE_FIELDS} }
  }
`;
